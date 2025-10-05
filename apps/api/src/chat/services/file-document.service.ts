import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';

import { CloudflareR2Service } from '../../services/cloudflare-r2.service'
import { DATABASE_CONNECTION } from '../../database/database-connection';
import { databaseSchema } from '../../database/schemas';
import { JobQueueService } from '../../queue/job-queue.service';
import { FileProcessingJobPayload } from '../../queue/jobs';


export interface CreateFileDocumentParams {
  chatId: string;
  file: Express.Multer.File;
  extractText?: boolean;
  userId?: string;
}

export interface GetDownloadUrlParams {
  documentId: string;
  expiresIn?: number;
}

@Injectable()
export class FileDocumentService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly jobQueueService: JobQueueService,
  ) {}

  async createFileDocument(params: CreateFileDocumentParams) {
    const { chatId, file, extractText, userId } = params;
    const shouldExtractText = this.normalizeBooleanFlag(extractText);
    
    const { key: fileKey, url: downloadUrl } = await this.cloudflareR2Service.uploadFile({
      file,
    });

    try {
      const [document] = await this.db.transaction(async (tx) => {
        const existingChat = await tx
          .select()
          .from(databaseSchema.chat)
          .where(eq(databaseSchema.chat.id, chatId))
          .limit(1);

        if (!existingChat.length) {
          await tx
            .insert(databaseSchema.chat)
            .values({
              id: chatId,
              createdAt: new Date(),
              title: `Chat with ${file.originalname}`,
              userId,
            });
        }

        const [doc] = await tx
          .insert(databaseSchema.document)
          .values({
            chatId,
            fileName: file.originalname,
            fileKey,
            fileSize: file.size,
            mimeType: file.mimetype,
            text: null,
            embedding: null,
            createdAt: new Date(),
          })
          .returning();
  
        return [doc];
      });
  
      if (shouldExtractText) {
        const jobPayload: FileProcessingJobPayload = {
          documentId: document.id,
          chatId,
          fileKey,
          mimeType: file.mimetype,
          fileName: file.originalname,
          extractText: true,
          userId,
        };

        await this.enqueueFileProcessingJob(jobPayload);
      }

      return {
        id: document.id,
        mimeType: document.mimeType,
        fileName: document.fileName,
        fileSize: document.fileSize,
        downloadUrl,
        processingQueued: shouldExtractText,
      };
    } catch (error) {
      await this.cloudflareR2Service.deleteFile(fileKey).catch(() => {});
      throw error;
    }
  }

  async createMultipleFileDocuments(params: {
    chatId: string;
    files: Express.Multer.File[];
    extractText?: boolean;
    userId?: string;
  }) {
    const { chatId, files, extractText: shouldExtractText = false, userId } = params;

    const createPromises = files.map(file =>
      this.createFileDocument({
        chatId,
        file,
        extractText: shouldExtractText,
        userId,
      }),
    );

    return Promise.all(createPromises);
  }

  private async enqueueFileProcessingJob(payload: FileProcessingJobPayload) {
    try {
      await this.jobQueueService.enqueueFileProcessing(payload);
    } catch (error) {
      console.error('Failed to enqueue file processing job', error);
    }
  }

  private normalizeBooleanFlag(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
    }
    return Boolean(value);
  }
}
