import { Injectable } from '@nestjs/common';
import { gmail } from '@googleapis/gmail';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';

@Injectable()
export class EmailProcessorService {
  constructor(private readonly emailAssistantQuery: EmailAssistantQueryService) {}

  async saveInboundMessage(message: any, gmailClient: ReturnType<typeof gmail>): Promise<boolean> {
    const headers = Object.fromEntries(message.payload.headers.map(h => [h.name, h.value]));
    const body = this.extractPlainText(message.payload);
    const attachments = await this.extractAttachments(message, gmailClient);

    return this.emailAssistantQuery.saveInboundMessage({
      id: message.id,
      threadId: message.threadId,
      fromEmail: headers['From'] ?? null,
      toEmail: headers['To'] ?? null,
      subject: headers['Subject'] ?? null,
      snippet: message.snippet ?? null,
      body,
      receivedAt: new Date(Number(message.internalDate)),
      attachments: attachments.map(att => ({
        filename: att.filename ?? null,
        mimeType: att.mimeType ?? null,
        data: att.data.toString('base64'),
      })),
    });
  }

  private extractPlainText(payload): string {
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain') {
          return Buffer.from(part.body.data || '', 'base64').toString('utf8');
        }
        if (part.parts) {
          const inner = this.extractPlainText(part);
          if (inner) return inner;
        }
      }
    }
    return Buffer.from(payload.body?.data || '', 'base64').toString('utf8');
  }

  private async extractAttachments(message: any, gmailClient: any) {
    const attachments = [];
    const parts = message.payload.parts || [];
    for (const part of parts) {
      if (part.filename && part.body.attachmentId) {
        const att = await gmailClient.users.messages.attachments.get({
          userId: 'me',
          messageId: message.id,
          id: part.body.attachmentId,
        });
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          data: Buffer.from(att.data.data, 'base64'),
        });
      }
    }
    return attachments;
  }
}
