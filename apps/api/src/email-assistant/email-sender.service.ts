import { Injectable } from '@nestjs/common';
import { gmail } from '@googleapis/gmail';
import { JWT } from 'google-auth-library';

import { ConfigService } from '@nestjs/config';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';

@Injectable()
export class EmailSenderService {
  constructor(
    private readonly config: ConfigService,
    private readonly emailAssistantQuery: EmailAssistantQueryService,
  ) {}

  async sendReply(userEmail: string, rawMime: string) {
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
      requestBody: { raw: encoded },
    });

    const sent = res.data;
    if (!sent.id) {
      throw new Error('email-sender:missing-id');
    }

    await this.emailAssistantQuery.saveOutboundMessage({
      id: sent.id,
      threadId: sent.threadId ?? null,
      fromEmail: userEmail,
      toEmail: '(recipient)',
      subject: '(subject)',
      snippet: sent.snippet ?? null,
      body: rawMime,
      receivedAt: new Date(),
    });

    return sent;
  }
}
