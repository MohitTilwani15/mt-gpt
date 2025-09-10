import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { extractText, getDocumentProxy } from 'unpdf';

import { CloudflareR2Service } from '../../services/cloudflare-r2.service'
import { DATABASE_CONNECTION } from '../../database/database-connection';
import { databaseSchema } from '../../database/schemas';


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
    private readonly configService: ConfigService,
  ) {}

  async createFileDocument(params: CreateFileDocumentParams) {
    const { chatId, file, extractText: shouldExtractText = false, userId } = params;

    const { key: fileKey, url: downloadUrl } = await this.cloudflareR2Service.uploadFile({
      file,
    });

    let textContent = null;
    let embedding = null;

    try {
      if (shouldExtractText && file.mimetype === 'application/pdf') {
        try {
          const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
          const { text } = await extractText(pdf, { mergePages: true });
          textContent = text;
  
          if (textContent.trim()) {
            const { embedding: textEmbedding } = await embed({
              model: openai.embedding(this.configService.getOrThrow<string>('EMBEDDING_MODEL')),
              value: textContent,
            });
            embedding = textEmbedding;
          }
        } catch (error) {
          console.warn('Failed to extract text from PDF:', error);
        }
      }

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
            text: textContent,
            embedding,
            createdAt: new Date(),
          })
          .returning();
  
        return [doc];
      });
  
      return {
        id: document.id,
        mimeType: document.mimeType,
        fileName: document.fileName,
        fileSize: document.fileSize,
        downloadUrl
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
}
