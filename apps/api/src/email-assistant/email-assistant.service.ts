import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { gmail } from '@googleapis/gmail';
import type { gmail_v1 } from '@googleapis/gmail';
import { JWT, OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

import { GmailSyncStateService } from './gmail-sync-state.service';
import { EmailProcessorService } from './email-processor.service';
import { JobQueueService } from 'src/queue/job-queue.service';

export interface PubSubMessage {
  data: string;
  messageId?: string;
  publishTime?: string;
  message_id?: string;
  publish_time?: string;
}

export interface PubSubPushBody {
  message: PubSubMessage;
  subscription: string;
}

interface GmailHistoryNotification {
  emailAddress: string;
  historyId: string | number;
}

interface EnvelopeSummary {
  subscription?: string;
  messageId?: string;
  publishTime?: string;
  tokenEmail?: string;
  tokenSub?: string;
  tokenIssuer?: string;
}

interface AuthContext {
  userEmail: string;
  historyId: string;
  gmailClient: gmail_v1.Gmail;
}

type AddedMessageWithId = gmail_v1.Schema$HistoryMessageAdded & { message: { id: string } };

@Injectable()
export class EmailAssistantService {
  private readonly logger = new Logger(EmailAssistantService.name);
  private readonly oauthClient = new OAuth2Client();

  constructor(
    private readonly config: ConfigService,
    private readonly gmailSyncStateService: GmailSyncStateService,
    private readonly emailProcessor: EmailProcessorService,
    private readonly jobQueueService: JobQueueService,
  ) {}

  async handlePubSubPush(body: PubSubPushBody, authorizationHeader?: string) {
    const envelopeSummary = this.buildEnvelopeSummary(body);
    let decoded: GmailHistoryNotification | null = null;
    let authContext: AuthContext | null = null;
    let tokenPayload: TokenPayload | null = null;

    try {
      this.logger.debug(`Received Pub/Sub push: ${JSON.stringify(envelopeSummary)}`);

      tokenPayload = await this.verifyPubSubAuthorization(authorizationHeader);
      envelopeSummary.tokenEmail = tokenPayload.email ?? undefined;
      envelopeSummary.tokenSub = tokenPayload.sub;
      envelopeSummary.tokenIssuer = tokenPayload.iss;

      decoded = this.decodePubSubMessage(body);
      authContext = await this.createAuthContext(decoded.emailAddress, decoded.historyId);

      const { historyEntries, lastHistoryIdUsed } = await this.fetchHistory(authContext);
      const addedMessages = this.extractAddedMessages(historyEntries);

      if (!addedMessages.length) {
        return this.handleNoNewMessages(authContext, envelopeSummary);
      }

      await this.processAddedMessages(authContext, addedMessages);
      return this.handleProcessedMessages(authContext, lastHistoryIdUsed, envelopeSummary);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Email-assistant error: ${error.message}`, error.stack);
      this.logger.error(
        `Email-assistant error context: ${JSON.stringify({
          ...envelopeSummary,
          historyId: authContext?.historyId,
          decoded,
          tokenSub: tokenPayload?.sub,
        })}`,
      );
      throw err;
    }
  }

  private buildEnvelopeSummary(body: PubSubPushBody): EnvelopeSummary {
    return {
      subscription: body?.subscription,
      messageId: body?.message?.messageId ?? body?.message?.message_id,
      publishTime: body?.message?.publishTime ?? body?.message?.publish_time,
    };
  }

  private decodePubSubMessage(body: PubSubPushBody): GmailHistoryNotification {
    const message = body?.message;
    if (!message?.data) {
      throw new Error('pubsub:missing-data');
    }

    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as GmailHistoryNotification;

    if (!decoded?.emailAddress || !decoded?.historyId) {
      throw new Error('pubsub:invalid-message');
    }

    return decoded;
  }

  private async createAuthContext(userEmail: string, historyId: string | number): Promise<AuthContext> {
    const normalizedHistoryId = String(historyId);
    const jwt = new JWT({
      email: this.config.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'),
      key: this.config.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      subject: userEmail,
    });

    const gmailClient = gmail({ version: 'v1', auth: jwt });

    return {
      userEmail,
      historyId: normalizedHistoryId,
      gmailClient,
    };
  }

  private async fetchHistory(authContext: AuthContext): Promise<{
    historyEntries: gmail_v1.Schema$History[];
    lastHistoryIdUsed: string;
  }> {
    const { gmailClient, userEmail, historyId } = authContext;
    const lastHistoryId = await this.gmailSyncStateService.getLastHistoryId(userEmail);
    const startHistoryId = lastHistoryId ?? historyId;

    const historyRes = await gmailClient.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
    });

    return {
      historyEntries: historyRes.data.history ?? [],
      lastHistoryIdUsed: startHistoryId,
    };
  }

  private extractAddedMessages(historyEntries: gmail_v1.Schema$History[]): AddedMessageWithId[] {
    return historyEntries
      .flatMap((entry) => entry.messagesAdded ?? [])
      .filter((added): added is AddedMessageWithId => typeof added.message?.id === 'string');
  }

  private async processAddedMessages(
    authContext: AuthContext,
    addedMessages: AddedMessageWithId[],
  ) {
    for (const { message: { id } } of addedMessages) {
      const msg = await authContext.gmailClient.users.messages.get({ userId: 'me', id, format: 'full' });
      await this.emailProcessor.saveInboundMessage(msg.data, authContext.gmailClient);

      await this.enqueueEmailReplyJob(authContext.userEmail, msg.data).catch((error) =>
        this.logger.error(`Failed to enqueue email reply for message ${id}: ${error instanceof Error ? error.message : error}`),
      );
    }
  }

  private async enqueueEmailReplyJob(userEmail: string, message: gmail_v1.Schema$Message) {
    if (!message) return;
    const headers = this.extractHeaders(message.payload?.headers);
    const sender = this.extractEmailAddress(headers.get('from'));
    const subject = headers.get('subject') ?? '(no subject)';

    if (!sender) {
      this.logger.debug(`Skipping reply for message ${message.id}; sender not found.`);
      return;
    }

    if (this.isSameMailbox(sender, userEmail)) {
      this.logger.debug(`Skipping reply for message ${message.id}; appears to originate from mailbox user.`);
      return;
    }

    const body = this.generatePlaceholderReply();

    await this.jobQueueService.enqueueEmailReply({
      userEmail,
      messageId: message.id!,
      threadId: message.threadId,
      toEmail: sender,
      subject,
      body,
    });
  }

  private extractHeaders(headers: gmail_v1.Schema$MessagePartHeader[] | undefined) {
    const map = new Map<string, string>();
    for (const header of headers ?? []) {
      if (!header.name || !header.value) continue;
      map.set(header.name.toLowerCase(), header.value);
    }
    return map;
  }

  private extractEmailAddress(headerValue?: string | null): string | null {
    if (!headerValue) return null;
    const match = headerValue.match(/<([^>]+)>/);
    const email = match ? match[1] : headerValue;
    return email.trim().toLowerCase();
  }

  private isSameMailbox(emailA: string, emailB: string | null) {
    if (!emailB) return false;
    return emailA.trim().toLowerCase() === emailB.trim().toLowerCase();
  }

  private generatePlaceholderReply() {
    const templates = [
      'Thanks for reaching out! We received your message and will follow up shortly.',
      'Appreciate the email—this is an automated acknowledgement while we prepare a full reply.',
      'Hi there! Quick note to say your message is in good hands. Expect a detailed response soon.',
    ];
    const index = Math.floor(Math.random() * templates.length);
    return templates[index] ?? templates[0];
  }

  private async handleNoNewMessages(authContext: AuthContext, envelopeSummary: EnvelopeSummary) {
    await this.gmailSyncStateService.saveLastHistoryId(authContext.userEmail, authContext.historyId);
    const response = { status: 'no_new_messages' as const };
    this.logger.log(
      `Processed Pub/Sub push: ${JSON.stringify({ ...envelopeSummary, historyId: authContext.historyId, status: response.status })}`,
    );
    return response;
  }

  private async handleProcessedMessages(
    authContext: AuthContext,
    lastHistoryIdUsed: string,
    envelopeSummary: EnvelopeSummary,
  ) {
    await this.gmailSyncStateService.saveLastHistoryId(authContext.userEmail, authContext.historyId);
    const response = { status: 'ok' as const };
    this.logger.log(
      `Processed Pub/Sub push: ${JSON.stringify({
        ...envelopeSummary,
        historyId: authContext.historyId,
        lastHistoryIdUsed,
        status: response.status,
      })}`,
    );
    return response;
  }

  private async verifyPubSubAuthorization(authorizationHeader?: string): Promise<TokenPayload> {
    const token = this.extractBearerToken(authorizationHeader);
    if (!token) {
      throw new UnauthorizedException('pubsub:missing-bearer-token');
    }

    const expectedAudience = this.config.get<string>('GOOGLE_PUBSUB_AUDIENCE');
    if (!expectedAudience) {
      this.logger.error('Missing GOOGLE_PUBSUB_AUDIENCE configuration for Pub/Sub authentication');
      throw new UnauthorizedException('pubsub:audience-not-configured');
    }

    let ticket;
    try {
      ticket = await this.oauthClient.verifyIdToken({
        idToken: token,
        audience: expectedAudience,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to verify Pub/Sub token: ${message}`);
      throw new UnauthorizedException('pubsub:verification-failed');
    }

    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('pubsub:invalid-token');
    }

    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      throw new UnauthorizedException('pubsub:invalid-issuer');
    }

    const expectedEmail = this.config.get<string>('GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL');
    if (expectedEmail && payload.email !== expectedEmail) {
      throw new UnauthorizedException('pubsub:unexpected-sender');
    }

    return payload;
  }

  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const matches = header.match(/^Bearer\s+(.+)$/i);
    return matches ? matches[1] : null;
  }
}
