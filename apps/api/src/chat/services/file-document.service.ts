import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, desc, sql } from 'drizzle-orm';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

import { CloudflareR2Service } from '../../services/cloudflare-r2.service'
import { DATABASE_CONNECTION } from '../../database/database-connection';
import { databaseSchema } from '../../database/schemas';

const pdfParse = require('pdf-parse');

export interface CreateFileDocumentParams {
  chatId: string;
  messageId?: string;
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
    const { chatId, messageId, file, extractText = false, userId } = params;

    const { key: fileKey, url: downloadUrl } = await this.cloudflareR2Service.uploadFile({
      file,
    });

    let textContent = null;
    let embedding = null;

    try {
      if (extractText && file.mimetype === 'application/pdf') {
        try {
          const pdfData = await pdfParse(file.buffer);
          textContent = pdfData.text;
  
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
          if (!userId) {
            throw new Error('User ID is required to create a new chat');
          }

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
            messageId,
            fileName: file.originalname,
            fileKey,
            fileSize: file.size,
            mimeType: file.mimetype,
            text: textContent,
            embedding,
            createdAt: new Date(),
          })
          .returning();
  
        if (messageId) {
          await tx.insert(databaseSchema.messageDocument).values({
            messageId,
            documentId: doc.id,
          });
        }
        return [doc];
      });
  
      return {
        id: document.id,
        fileName: document.fileName,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        downloadUrl,
        textExtracted: !!textContent,
      };
    } catch (error) {
      await this.cloudflareR2Service.deleteFile(fileKey).catch(() => {});
      throw error;
    }
  }

  async createMultipleFileDocuments(params: {
    chatId: string;
    messageId?: string;
    files: Express.Multer.File[];
    extractText?: boolean;
    userId?: string;
  }) {
    const { chatId, messageId, files, extractText = false, userId } = params;

    const createPromises = files.map(file =>
      this.createFileDocument({
        chatId,
        messageId,
        file,
        extractText,
        userId,
      }),
    );

    return Promise.all(createPromises);
  }

  async getDownloadUrl(params: GetDownloadUrlParams) {
    const { documentId, expiresIn = 3600 } = params;

    const [document] = await this.db
      .select()
      .from(databaseSchema.document)
      .where(eq(databaseSchema.document.id, documentId));

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.cloudflareR2Service.getDownloadUrl({
      key: document.fileKey,
      expiresIn,
    });
  }

  async getDocumentsByMessageId(messageId: string) {
    return this.db
      .select({
        id: databaseSchema.document.id,
        fileName: databaseSchema.document.fileName,
        fileSize: databaseSchema.document.fileSize,
        mimeType: databaseSchema.document.mimeType,
        createdAt: databaseSchema.document.createdAt,
        textExtracted: sql`${databaseSchema.document.text} IS NOT NULL`,
      })
      .from(databaseSchema.document)
      .innerJoin(
        databaseSchema.messageDocument,
        eq(databaseSchema.messageDocument.documentId, databaseSchema.document.id),
      )
      .where(eq(databaseSchema.messageDocument.messageId, messageId))
      .orderBy(desc(databaseSchema.document.createdAt));
  }

  async getDocumentsByChatId(chatId: string) {
    return this.db
      .select()
      .from(databaseSchema.document)
      .where(eq(databaseSchema.document.chatId, chatId))
      .orderBy(desc(databaseSchema.document.createdAt));
  }

  async deleteDocument(documentId: string) {
    const [document] = await this.db
      .select()
      .from(databaseSchema.document)
      .where(eq(databaseSchema.document.id, documentId));

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.cloudflareR2Service.deleteFile(document.fileKey);

    await this.db
      .delete(databaseSchema.document)
      .where(eq(databaseSchema.document.id, documentId));

    return { success: true, message: 'Document deleted successfully' };
  }

  async deleteDocumentsByChatId(chatId: string) {
    const documents = await this.getDocumentsByChatId(chatId);

    const deletePromises = documents.map(doc =>
      this.cloudflareR2Service.deleteFile(doc.fileKey),
    );
    await Promise.all(deletePromises);

    await this.db
      .delete(databaseSchema.document)
      .where(eq(databaseSchema.document.chatId, chatId));

    return { success: true, message: 'All documents deleted successfully' };
  }
}
