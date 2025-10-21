import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { extractText, getDocumentProxy } from 'unpdf';
import * as mammoth from 'mammoth';

import { DATABASE_CONNECTION } from '../../database/database-connection';
import { databaseSchema } from '../../database/schemas';
import { CloudflareR2Service } from '../../services/cloudflare-r2.service';

const SUPPORTED_OCR_MIMETYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly configService: ConfigService,
    private readonly cloudflareR2Service: CloudflareR2Service,
  ) {}

  async processDocument(documentId: string, tenantId?: string, options?: { force?: boolean }) {
    let stage: string = 'initial';

    const [document] = await this.db
      .select()
      .from(databaseSchema.document)
      .where(tenantId
        ? and(eq(databaseSchema.document.id, documentId), eq(databaseSchema.document.tenantId, tenantId))
        : eq(databaseSchema.document.id, documentId))
      .limit(1);

    if (!document) {
      this.logger.warn(`Document ${documentId} not found. Skipping processing.`);
      return;
    }

    if (document.text && !options?.force) {
      this.logger.debug(`Document ${documentId} already processed. Skipping.`);
      return;
    }

    if (!document.fileKey || !document.mimeType) {
      this.logger.warn(`Document ${documentId} missing file metadata. Skipping.`);
      return;
    }

    if (!SUPPORTED_OCR_MIMETYPES.has(document.mimeType)) {
      this.logger.debug(`Document ${documentId} has unsupported mimeType ${document.mimeType}. Skipping.`);
      return;
    }

    try {
      stage = 'download';
      this.logger.debug(`Downloading source file for document ${documentId} (key: ${document.fileKey}).`);
      const buffer = await this.cloudflareR2Service.getFileBuffer(document.fileKey);
      this.logger.debug(`Downloaded ${buffer.byteLength} bytes for document ${documentId}.`);

      stage = 'extract-text';
      const text = await this.extractTextFromBuffer(buffer, document.mimeType);
      this.logger.debug(
        `Extracted ${text ? text.length : 0} characters from document ${documentId} using ${document.mimeType}.`,
      );
      if (!text || !text.trim()) {
        this.logger.debug(`Document ${documentId} produced no extractable text.`);
        await this.db
          .update(databaseSchema.document)
          .set({ text: null, embedding: null })
          .where(tenantId
            ? and(eq(databaseSchema.document.id, documentId), eq(databaseSchema.document.tenantId, tenantId))
            : eq(databaseSchema.document.id, documentId));
        return;
      }

      const sanitized = text.trim();
      this.logger.debug(`Sanitized text length for document ${documentId}: ${sanitized.length}.`);
      stage = 'generate-embedding';
      const embedding = await this.generateEmbedding(sanitized);
      this.logger.debug(
        embedding
          ? `Generated embedding (length ${embedding.length}) for document ${documentId}.`
          : `No embedding generated for document ${documentId}.`,
      );

      await this.db
        .update(databaseSchema.document)
        .set({ text: sanitized, embedding })
        .where(tenantId
          ? and(eq(databaseSchema.document.id, documentId), eq(databaseSchema.document.tenantId, tenantId))
          : eq(databaseSchema.document.id, documentId));

      this.logger.log(`Document ${documentId} processed successfully.`);
    } catch (error) {
      this.logger.error(
        `Failed to process document ${documentId} at stage ${stage}: ${(error as Error)?.message ?? error}`,
        error as Error,
      );
      throw error;
    }
  }

  private async extractTextFromBuffer(buffer: Buffer, mimeType: string) {
    try {
      if (mimeType === 'application/pdf') {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        return text;
      }

      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to extract text for mimeType ${mimeType}`, error as Error);
      return null;
    }
  }

  private async generateEmbedding(value: string) {
    try {
      const model = this.configService.get<string>('EMBEDDING_MODEL');
      if (!model) {
        this.logger.warn('EMBEDDING_MODEL is not configured. Skipping embedding generation.');
        return null;
      }
      const { embedding: textEmbedding } = await embed({
        model: openai.embedding(model),
        value,
      });
      return textEmbedding;
    } catch (error) {
      this.logger.warn('Failed to generate embedding', error as Error);
      return null;
    }
  }
}
