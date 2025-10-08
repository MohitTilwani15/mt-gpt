import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';
import { CloudflareR2Service } from 'src/services/cloudflare-r2.service';

@Injectable()
export class ContractTextExtractionService {
  private readonly logger = new Logger(ContractTextExtractionService.name);

  constructor(
    private readonly emailAssistantQuery: EmailAssistantQueryService,
    private readonly cloudflareR2Service: CloudflareR2Service,
  ) {}

  async parseMessageDocx(messageId: string) {
    return this.parseMessageDocxHtml(messageId);
  }

  async parseMessageDocxHtml(messageId: string) {
    const attachments = await this.emailAssistantQuery.getMessageAttachments(messageId);

    if (!attachments.length) {
      this.logger.warn(`No attachments found for message ${messageId}`);
      return null;
    }

    const docxAttachment = attachments.find((att) => this.isDocxMime(att.mimeType));
    if (!docxAttachment) {
      this.logger.warn(`No DOCX attachment found for message ${messageId}`);
      return null;
    }

    return this.parseDocxToHtml(Buffer.from(docxAttachment.data, 'base64'));
  }

  async parseMessageDocxText(messageId: string) {
    const attachments = await this.emailAssistantQuery.getMessageAttachments(messageId);

    if (!attachments.length) {
      this.logger.warn(`No attachments found for message ${messageId}`);
      return null;
    }

    const docxAttachment = attachments.find((att) => this.isDocxMime(att.mimeType));
    if (docxAttachment) {
      return this.parseDocxToText(Buffer.from(docxAttachment.data, 'base64'));
    }

    const pdfAttachment = attachments.find((att) => this.isPdfMime(att.mimeType));
    if (pdfAttachment) {
      return this.parsePdfToText(Buffer.from(pdfAttachment.data, 'base64'));
    }

    this.logger.warn(`No DOCX or PDF attachment found for message ${messageId}`);
    return null;
  }

  async parseDocx(fileBuffer: Buffer) {
    return this.parseDocxToHtml(fileBuffer);
  }

  async parseDocxToHtml(fileBuffer: Buffer) {
    const result = await mammoth.convertToHtml({ buffer: fileBuffer });
    return result.value ?? null;
  }

  async parseDocxToText(fileBuffer: Buffer) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value ?? null;
  }

  private async parsePdfToText(fileBuffer: Buffer) {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(fileBuffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return text ?? null;
    } catch (error) {
      this.logger.warn(`Failed to extract PDF text: ${(error as Error)?.message ?? error}`);
      return null;
    }
  }

  async parseStorageKeyDocx(storageKey: string, mimeType: string) {
    if (!this.isDocxMime(mimeType)) {
      this.logger.warn(`Storage key ${storageKey} has non-DOCX mimetype ${mimeType}`);
      return null;
    }

    const buffer = await this.cloudflareR2Service.getFileBuffer(storageKey);
    return this.parseDocxToHtml(buffer);
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

  private isPdfMime(mimeType: string | null | undefined): boolean {
    if (!mimeType) return false;
    const normalized = mimeType.toLowerCase();
    return normalized === 'application/pdf' || normalized.endsWith('+pdf');
  }
}
