import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, desc, cosineDistance } from 'drizzle-orm';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

import { DATABASE_CONNECTION } from '../../database/database-connection';
import { databaseSchema } from '../../database/schemas';

export interface CreateDocumentParams {
  chatId: string;
  tenantId: string;
  text: string;
  fileName?: string;
  fileKey?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface SearchDocumentsParams {
  chatId: string;
  tenantId: string;
  query: string;
  limit?: number;
}

@Injectable()
export class DocumentQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly configService: ConfigService,
  ) {}

  async createDocument(params: CreateDocumentParams) {
    const { chatId, tenantId, text, fileName, fileKey, fileSize, mimeType } = params;
    
    let embedding = null;
    if (text && text.trim()) {
      const { embedding: textEmbedding } = await embed({
        model: openai.embedding(this.configService.getOrThrow<string>('EMBEDDING_MODEL')),
        value: text,
      });
      embedding = textEmbedding;
    }

    const [document] = await this.db
      .insert(databaseSchema.document)
      .values({
        chatId,
        tenantId,
        text,
        fileName: fileName || 'text-document.txt',
        fileKey: fileKey || `text-${Date.now()}.txt`,
        fileSize: fileSize || text.length,
        mimeType: mimeType || 'text/plain',
        embedding,
        createdAt: new Date(),
      })
      .returning();

    return document;
  }

  async searchDocuments(params: SearchDocumentsParams) {
    const { chatId, tenantId, query, limit = 5 } = params;
    
    // Generate embedding for the search query
    const { embedding: queryEmbedding } = await embed({
      model: openai.embedding(this.configService.getOrThrow<string>('EMBEDDING_MODEL')),
      value: query,
    });

    // Search for similar documents using cosine similarity
    const results = await this.db
      .select({
        id: databaseSchema.document.id,
        chatId: databaseSchema.document.chatId,
        text: databaseSchema.document.text,
        similarity: cosineDistance(databaseSchema.document.embedding, queryEmbedding),
        createdAt: databaseSchema.document.createdAt,
      })
      .from(databaseSchema.document)
      .where(and(eq(databaseSchema.document.chatId, chatId), eq(databaseSchema.document.tenantId, tenantId)))
      .orderBy(cosineDistance(databaseSchema.document.embedding, queryEmbedding))
      .limit(limit);

    return results.map(result => ({
      ...result,
      similarity: 1 - Number(result.similarity), // Convert distance to similarity
    }));
  }

  async getDocumentsByChatId(chatId: string, tenantId: string) {
    return this.db
      .select()
      .from(databaseSchema.document)
      .where(and(eq(databaseSchema.document.chatId, chatId), eq(databaseSchema.document.tenantId, tenantId)))
      .orderBy(desc(databaseSchema.document.createdAt));
  }

  async getDocumentById(documentId: string, tenantId: string) {
    return this.db
      .select()
      .from(databaseSchema.document)
      .where(and(eq(databaseSchema.document.id, documentId), eq(databaseSchema.document.tenantId, tenantId)))
  }

  async deleteDocumentById(id: string, tenantId: string) {
    const [deletedDocument] = await this.db
      .delete(databaseSchema.document)
      .where(and(eq(databaseSchema.document.id, id), eq(databaseSchema.document.tenantId, tenantId)))
      .returning();

    return deletedDocument;
  }

  async deleteDocumentsByChatId(chatId: string, tenantId: string) {
    return this.db
      .delete(databaseSchema.document)
      .where(and(eq(databaseSchema.document.chatId, chatId), eq(databaseSchema.document.tenantId, tenantId)));
  }
}
