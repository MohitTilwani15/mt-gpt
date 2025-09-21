import { Injectable, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';

interface CreateAssistantKnowledgeParams {
  assistantId: string;
  fileName: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  text?: string | null;
  embedding?: number[] | null;
  uploadedBy?: string | null;
}

@Injectable()
export class AssistantKnowledgeQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async createKnowledgeRecord(params: CreateAssistantKnowledgeParams) {
    const { assistantId, fileName, fileKey, fileSize, mimeType, text, embedding, uploadedBy } = params;

    const [record] = await this.db
      .insert(databaseSchema.assistantKnowledge)
      .values({
        assistantId,
        fileName,
        fileKey,
        fileSize,
        mimeType,
        text: text ?? null,
        embedding: embedding ?? null,
        uploadedBy: uploadedBy ?? null,
      })
      .returning();

    return record;
  }

  async listKnowledge(assistantId: string) {
    return this.db
      .select()
      .from(databaseSchema.assistantKnowledge)
      .where(eq(databaseSchema.assistantKnowledge.assistantId, assistantId));
  }

  async deleteKnowledgeRecord(assistantId: string, knowledgeId: string) {
    const [record] = await this.db
      .delete(databaseSchema.assistantKnowledge)
      .where(
        and(
          eq(databaseSchema.assistantKnowledge.id, knowledgeId),
          eq(databaseSchema.assistantKnowledge.assistantId, assistantId),
        ),
      )
      .returning();

    return record ?? null;
  }
}
