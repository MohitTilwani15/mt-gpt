import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { gmail_v1 } from '@googleapis/gmail';
import { OAuth2Client } from 'google-auth-library';
import type { TokenPayload } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

import { GmailSyncStateService } from './gmail-sync-state.service';
import { EmailProcessorService } from './email-processor.service';
import { JobQueueService } from 'src/queue/job-queue.service';
import { GmailAuthService, GmailAuthContext } from './gmail-auth.service';
import { GmailHistoryService } from './gmail-history.service';
import { GmailMessageParserService, HistoryMessageAdded } from './gmail-message-parser.service';

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

@Injectable()
export class EmailAssistantService {
  private readonly logger = new Logger(EmailAssistantService.name);
  private readonly oauthClient = new OAuth2Client();

  constructor(
    private readonly config: ConfigService,
    private readonly gmailSyncStateService: GmailSyncStateService,
    private readonly emailProcessor: EmailProcessorService,
    private readonly jobQueueService: JobQueueService,
    private readonly gmailAuthService: GmailAuthService,
    private readonly gmailHistoryService: GmailHistoryService,
    private readonly gmailMessageParser: GmailMessageParserService,
  ) {}

  async handlePubSubPush(body: PubSubPushBody, authorizationHeader?: string) {
    const envelopeSummary = this.buildEnvelopeSummary(body);
    let decoded: GmailHistoryNotification | null = null;
    let authContext: GmailAuthContext | null = null;
    let tokenPayload: TokenPayload | null = null;

    try {
      this.logger.debug(`Received Pub/Sub push: ${JSON.stringify(envelopeSummary)}`);

      tokenPayload = await this.verifyPubSubAuthorization(authorizationHeader);
      envelopeSummary.tokenEmail = tokenPayload.email ?? undefined;
      envelopeSummary.tokenSub = tokenPayload.sub;
      envelopeSummary.tokenIssuer = tokenPayload.iss;

      decoded = this.decodePubSubMessage(body);
      authContext = this.gmailAuthService.createContext(decoded.emailAddress, decoded.historyId);

      const { historyEntries, lastHistoryIdUsed, responseHistoryId } = await this.fetchHistory(authContext);
      const addedMessages = this.gmailMessageParser.extractAddedMessages(historyEntries);

      if (!addedMessages.length) {
        return this.handleNoNewMessages(authContext, envelopeSummary, responseHistoryId);
      }

      await this.processAddedMessages(authContext, addedMessages);

      return this.handleProcessedMessages(
        authContext,
        lastHistoryIdUsed,
        historyEntries,
        responseHistoryId,
        envelopeSummary,
      );
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

  private async fetchHistory(authContext: GmailAuthContext): Promise<{
    historyEntries: gmail_v1.Schema$History[];
    lastHistoryIdUsed: string;
    responseHistoryId: string | null;
  }> {
    const lastHistoryId = await this.gmailSyncStateService.getLastHistoryId(authContext.userEmail);

    return this.gmailHistoryService.fetchHistory({
      gmailClient: authContext.client,
      historyId: authContext.historyId,
      lastStoredHistoryId: lastHistoryId,
    });
  }

  private async processAddedMessages(authContext: GmailAuthContext, addedMessages: HistoryMessageAdded[]) {
    for (const { message: { id } } of addedMessages) {
      let msg;

      try {
        msg = await authContext.client.users.messages.get({ userId: 'me', id, format: 'full' });
      } catch (error) {
        const status = (error as any)?.code ?? (error as any)?.response?.status;
        if (status === 404) {
          this.logger.warn(`Message ${id} no longer available; skipping.`);
          continue;
        }
        throw error;
      }

      const isNewMessage = await this.emailProcessor.saveInboundMessage(msg.data, authContext.client);

      if (!isNewMessage) {
        this.logger.debug(`Message ${id} already processed; skipping auto actions.`);
        continue;
      }

      const headers = this.gmailMessageParser.extractHeaders(msg.data.payload?.headers);
      const senderEmail = this.gmailMessageParser.extractEmailAddress(headers.get('from'));
      const subject = headers.get('subject') ?? '(no subject)';

      if (!senderEmail || this.isSameMailbox(senderEmail, authContext.userEmail)) {
        this.logger.debug(`Skipping auto actions for message ${id}; sender email missing or same as mailbox.`);
        continue;
      }

      const hasAttachments = this.gmailMessageParser.hasAttachments(msg.data.payload?.parts ?? []);
      if (!hasAttachments) {
        this.logger.debug(`Message ${id} has no attachments; skipping contract review enqueue.`);
        continue;
      }

      await this.jobQueueService
        .enqueueContractReview({
          messageId: msg.data.id!,
          userEmail: authContext.userEmail,
          senderEmail,
          subject,
          threadId: msg.data.threadId,
          contractType: 'unknown',
        })
        .catch((error) =>
          this.logger.error(
            `Failed to enqueue contract review for message ${id}: ${error instanceof Error ? error.message : error}`,
          ),
        );
    }
  }

  private isSameMailbox(emailA: string, emailB: string | null) {
    if (!emailB) return false;
    return emailA.trim().toLowerCase() === emailB.trim().toLowerCase();
  }

  private async handleNoNewMessages(
    authContext: GmailAuthContext,
    envelopeSummary: EnvelopeSummary,
    responseHistoryId: string | null,
  ) {
    const toStore = responseHistoryId ?? authContext.historyId;
    await this.gmailSyncStateService.saveLastHistoryId(authContext.userEmail, toStore);
    const response = { status: 'no_new_messages' };
    this.logger.log(
      `Processed Pub/Sub push: ${JSON.stringify({ ...envelopeSummary, historyId: toStore, status: response.status })}`,
    );

    return response;
  }

  private async handleProcessedMessages(
    authContext: GmailAuthContext,
    lastHistoryIdUsed: string,
    historyEntries: gmail_v1.Schema$History[],
    responseHistoryId: string | null,
    envelopeSummary: EnvelopeSummary,
  ) {
    const latestHistoryId = responseHistoryId
      ?? this.gmailMessageParser.getLatestHistoryId(historyEntries)
      ?? authContext.historyId;
    await this.gmailSyncStateService.saveLastHistoryId(authContext.userEmail, latestHistoryId);
    const response = { status: 'ok' };
    this.logger.log(
      `Processed Pub/Sub push: ${JSON.stringify({
        ...envelopeSummary,
        historyId: latestHistoryId,
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
