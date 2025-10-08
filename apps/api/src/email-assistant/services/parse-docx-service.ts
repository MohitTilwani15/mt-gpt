import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';
import { CloudflareR2Service } from 'src/services/cloudflare-r2.service';

@Injectable()
export class ParseDocxService {
  private readonly logger = new Logger(ParseDocxService.name);

  constructor(
    private readonly emailAssistantQuery: EmailAssistantQueryService,
    private readonly cloudflareR2Service: CloudflareR2Service,
  ) {}

  async parseMessageDocx(messageId: string) {
    const attachments = await this.emailAssistantQuery.getMessageAttachments(messageId);

    if (!attachments.length) {
      this.logger.warn(`No attachments found for message ${messageId}`);
      return null;
    }

    const docxAttachment = attachments.find(att => this.isDocxMime(att.mimeType));

    if (!docxAttachment) {
      this.logger.warn(`No DOCX attachment found for message ${messageId}`);
      return null;
    }

    return this.parseDocx(Buffer.from(docxAttachment.data, 'base64'));
  }

  async parseDocx(fileBuffer: Buffer) {
    const result = await mammoth.convertToHtml({ buffer: fileBuffer });
    return result.value ?? null;
  }

  async parseStorageKeyDocx(storageKey: string, mimeType: string) {
    if (!this.isDocxMime(mimeType)) {
      this.logger.warn(`Storage key ${storageKey} has non-DOCX mimetype ${mimeType}`);
      return null;
    }

    const buffer = await this.cloudflareR2Service.getFileBuffer(storageKey);
    return this.parseDocx(buffer);
  }

  private isDocxMime(mimeType: string | null | undefined): boolean {
    if (!mimeType) return false;
    const normalized = mimeType.toLowerCase();
    return (
      normalized.includes('wordprocessingml.document') ||
      normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      normalized === 'application/msword'
    );
  }
}
