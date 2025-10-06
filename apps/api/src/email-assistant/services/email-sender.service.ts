import { Injectable } from '@nestjs/common';
import { gmail } from '@googleapis/gmail';
import { JWT } from 'google-auth-library';

import { ConfigService } from '@nestjs/config';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';

interface ReplyAttachment {
  filename: string;
  mimeType: string;
  data: string; // base64 encoded
}

interface SendReplyParams {
  userEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  threadId?: string | null;
  snippet?: string | null;
  attachments?: ReplyAttachment[];
}

@Injectable()
export class EmailSenderService {
  constructor(
    private readonly config: ConfigService,
    private readonly emailAssistantQuery: EmailAssistantQueryService,
  ) {}

  async sendReply(params: SendReplyParams) {
    const { userEmail, toEmail, subject, body, threadId, snippet, attachments } = params;
    const jwt = new JWT({
      email: this.config.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'),
      key: this.config.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: userEmail,
    });

    const gmailClient = gmail({ version: 'v1', auth: jwt });
    const rawMime = this.buildMimeMessage({ userEmail, toEmail, subject, body, attachments });
    const encoded = Buffer.from(rawMime)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

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
      snippet: sent.snippet ?? snippet ?? body.slice(0, 120),
      body: rawMime,
      receivedAt: new Date(),
      attachments: attachments?.map((att) => ({
        filename: att.filename,
        mimeType: att.mimeType,
        data: att.data,
      })),
    });

    return sent;
  }

  private buildMimeMessage(params: {
    userEmail: string;
    toEmail: string;
    subject: string;
    body: string;
    attachments?: ReplyAttachment[];
  }) {
    const { userEmail, toEmail, subject, body, attachments = [] } = params;
    const normalizedSubject = subject?.toLowerCase().startsWith('re:') ? subject : `Re: ${subject ?? ''}`;

    if (!attachments.length) {
      return [
        `From: ${userEmail}`,
        `To: ${toEmail}`,
        `Subject: ${normalizedSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        body,
      ].join('\r\n');
    }

    const boundary = `----=_Part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const lines = [
      `From: ${userEmail}`,
      `To: ${toEmail}`,
      `Subject: ${normalizedSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      body,
    ];

    for (const attachment of attachments) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${attachment.mimeType}`);
      lines.push(
        `Content-Disposition: attachment; filename="${attachment.filename.replace(/"/g, '\\"')}"`,
      );
      lines.push('Content-Transfer-Encoding: base64');
      lines.push('');
      lines.push(attachment.data.replace(/\s+/g, ''));
    }

    lines.push(`--${boundary}--`);
    lines.push('');

    return lines.join('\r\n');
  }
}
