import { Injectable } from '@nestjs/common';
import { gmail } from '@googleapis/gmail';
import type { gmail_v1 } from '@googleapis/gmail';
import { JWT } from 'google-auth-library';

import { ConfigService } from '@nestjs/config';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';

interface SendReplyParams {
  userEmail: string;
  rawMime: string;
  threadId?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  snippet?: string | null;
}

@Injectable()
export class EmailSenderService {
  constructor(
    private readonly config: ConfigService,
    private readonly emailAssistantQuery: EmailAssistantQueryService,
  ) {}

  async sendReply(params: SendReplyParams) {
    const { userEmail, rawMime, threadId, toEmail = null, subject = null, snippet = null } = params;
    const jwt = new JWT({
      email: this.config.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'),
      key: this.config.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: userEmail,
    });

    const gmailClient = gmail({ version: 'v1', auth: jwt });
    const encoded = Buffer.from(rawMime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    const res = await gmailClient.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        threadId: threadId ?? undefined,
      },
    });

    const sent = res.data;
    if (!sent.id) {
      throw new Error('email-sender:missing-id');
    }

    await this.emailAssistantQuery.saveOutboundMessage({
      id: sent.id,
      threadId: sent.threadId ?? threadId ?? null,
      fromEmail: userEmail,
      toEmail,
      subject,
      snippet: sent.snippet ?? snippet ?? null,
      body: rawMime,
      receivedAt: new Date(),
    });

    return sent;
  }

  async sendAutoReply(params: {
    userEmail: string;
    originalMessage: gmail_v1.Schema$Message;
    body?: string;
  }) {
    const { userEmail, originalMessage, body } = params;
    const headers = this.extractHeaders(originalMessage.payload?.headers);
    const recipient = headers.get('from') ?? null;
    const subject = headers.get('subject') ?? null;
    const messageId = headers.get('message-id') ?? null;

    if (!recipient) {
      throw new Error('email-sender:missing-recipient');
    }

    const normalizedSubject = subject && subject.toLowerCase().startsWith('re:')
      ? subject
      : `Re: ${subject ?? 'No subject'}`;

    const replyBody = body ?? 'Thanks for your message! This is an automated test reply.';
    const lines = [
      `From: ${userEmail}`,
      `To: ${recipient}`,
      `Subject: ${normalizedSubject}`,
    ];

    if (messageId) {
      lines.push(`In-Reply-To: ${messageId}`);
      lines.push(`References: ${messageId}`);
    }

    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(replyBody);

    const rawMime = lines.join('\r\n');

    await this.sendReply({
      userEmail,
      rawMime,
      threadId: originalMessage.threadId ?? null,
      toEmail: recipient,
      subject: normalizedSubject,
      snippet: replyBody,
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
}
