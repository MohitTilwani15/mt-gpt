import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, isNotNull, sql, gte, cosineDistance } from 'drizzle-orm';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

import { DATABASE_CONNECTION } from '../../database/database-connection';
import { databaseSchema } from '../../database/schemas';

export interface CreateMemoryParams {
  userId: string;
  tenantId: string;
  chatId?: string | null;
  messageId?: string | null;
  text: string;
  expiresAt?: Date | null;
}

export interface SearchMemoryParams {
  userId: string;
  tenantId: string;
  chatId?: string | null;
  query: string;
  limit?: number;
  minSimilarity?: number; // 0-1
}

@Injectable()
export class MemoryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly configService: ConfigService,
  ) {}

  async createMemory(params: CreateMemoryParams) {
    const { userId, tenantId, chatId = null, messageId = null, text, expiresAt = null } = params;

    let embedding = null as any;
    if (text && text.trim()) {
      const { embedding: e } = await embed({
        model: openai.embedding(this.configService.getOrThrow<string>('EMBEDDING_MODEL')),
        value: text,
      });
      embedding = e;
    }

    const [row] = await this.db
      .insert(databaseSchema.memory)
      .values({
        tenantId,
        userId,
        chatId: chatId || null,
        messageId: messageId || null,
        text,
        embedding,
        expiresAt,
        createdAt: new Date(),
      })
      .returning();

    return row;
  }

  async searchMemories(params: SearchMemoryParams) {
    const {
      userId,
      tenantId,
      chatId = null,
      query,
      limit = 5,
      minSimilarity = 0.7,
    } = params;

    const { embedding: queryEmbedding } = await embed({
      model: openai.embedding(this.configService.getOrThrow<string>('EMBEDDING_MODEL')),
      value: query,
    });

    const where = and(
      eq(databaseSchema.memory.userId, userId),
      eq(databaseSchema.memory.tenantId, tenantId),
      chatId ? eq(databaseSchema.memory.chatId, chatId as any) : sql`1=1`,
      orNullNotExpired(databaseSchema.memory.expiresAt),
      isNotNull(databaseSchema.memory.embedding),
    );
    const distanceExpr = cosineDistance(databaseSchema.memory.embedding, queryEmbedding);

    const rows = await this.db
      .select({
        id: databaseSchema.memory.id,
        text: databaseSchema.memory.text,
        createdAt: databaseSchema.memory.createdAt,
        distance: distanceExpr,
      })
      .from(databaseSchema.memory)
      .where(where)
      .orderBy(distanceExpr)
      .limit(limit);

    return rows
      .map((r) => ({ ...r, similarity: 1 - Number((r as any).distance) }))
      .filter((r) => r.similarity >= minSimilarity);
  }
}

function orNullNotExpired(expiresAtCol: any) {
  return sql`(${expiresAtCol} IS NULL OR ${expiresAtCol} > NOW())`;
}
