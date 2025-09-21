import { Injectable, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';
import type { AssistantCapabilities } from '../schemas/assistant.schema';

interface CreateAssistantParams {
  ownerId: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  defaultModel?: string | null;
  capabilities?: AssistantCapabilities;
}

interface UpdateAssistantParams {
  assistantId: string;
  ownerId: string;
  name?: string;
  description?: string | null;
  instructions?: string | null;
  defaultModel?: string | null;
  capabilities?: AssistantCapabilities;
}

@Injectable()
export class AssistantQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async createAssistant(params: CreateAssistantParams) {
    const { ownerId, name, description, instructions, defaultModel, capabilities } = params;

    const [assistant] = await this.db
      .insert(databaseSchema.assistant)
      .values({
        ownerId,
        name,
        description: description ?? null,
        instructions: instructions ?? null,
        defaultModel: defaultModel ?? null,
        capabilities: capabilities ?? {},
      })
      .returning();

    return assistant;
  }

  async updateAssistant(params: UpdateAssistantParams) {
    const { assistantId, ownerId, ...updates } = params;

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.instructions !== undefined) updatePayload.instructions = updates.instructions;
    if (updates.defaultModel !== undefined) updatePayload.defaultModel = updates.defaultModel;
    if (updates.capabilities !== undefined) updatePayload.capabilities = updates.capabilities;

    const [assistant] = await this.db
      .update(databaseSchema.assistant)
      .set(updatePayload)
      .where(and(eq(databaseSchema.assistant.id, assistantId), eq(databaseSchema.assistant.ownerId, ownerId)))
      .returning();

    return assistant ?? null;
  }

  async deleteAssistant(assistantId: string, ownerId: string) {
    const [deleted] = await this.db
      .delete(databaseSchema.assistant)
      .where(and(eq(databaseSchema.assistant.id, assistantId), eq(databaseSchema.assistant.ownerId, ownerId)))
      .returning();

    return deleted ?? null;
  }

  async getAssistantById(assistantId: string) {
    const assistant = await this.db.query.assistant.findFirst({
      where: eq(databaseSchema.assistant.id, assistantId),
      with: {
        knowledge: true,
        shares: true,
      },
    });

    return assistant ?? null;
  }

  async getAssistantForUser(assistantId: string, userId: string) {
    const assistant = await this.db.query.assistant.findFirst({
      where: eq(databaseSchema.assistant.id, assistantId),
      with: {
        knowledge: true,
        shares: true,
      },
    });

    if (!assistant) {
      return null;
    }

    if (assistant.ownerId === userId) {
      return assistant;
    }

    const shared = await this.db.query.assistantShare.findFirst({
      where: and(
        eq(databaseSchema.assistantShare.assistantId, assistantId),
        eq(databaseSchema.assistantShare.userId, userId),
      ),
    });

    return shared ? assistant : null;
  }

  async listAssistantsForUser(userId: string) {
    const owned = await this.db.query.assistant.findMany({
      where: eq(databaseSchema.assistant.ownerId, userId),
    });

    const sharedRows = await this.db
      .select({ assistant: databaseSchema.assistant })
      .from(databaseSchema.assistantShare)
      .innerJoin(
        databaseSchema.assistant,
        eq(databaseSchema.assistantShare.assistantId, databaseSchema.assistant.id),
      )
      .where(eq(databaseSchema.assistantShare.userId, userId));

    const shared = sharedRows.map((row) => row.assistant);

    const results = [...owned];
    const ownedIds = new Set(results.map((assistant) => assistant.id));

    for (const assistant of shared) {
      if (!ownedIds.has(assistant.id)) {
        results.push(assistant);
      }
    }

    return results;
  }

  async upsertShare(params: { assistantId: string; userId: string; canManage?: boolean }) {
    const { assistantId, userId, canManage = false } = params;

    const [share] = await this.db
      .insert(databaseSchema.assistantShare)
      .values({
        assistantId,
        userId,
        canManage,
      })
      .onConflictDoUpdate({
        target: [databaseSchema.assistantShare.assistantId, databaseSchema.assistantShare.userId],
        set: {
          canManage,
        },
      })
      .returning();

    return share;
  }

  async removeShare(params: { assistantId: string; userId: string }) {
    const { assistantId, userId } = params;

    const [removed] = await this.db
      .delete(databaseSchema.assistantShare)
      .where(
        and(
          eq(databaseSchema.assistantShare.assistantId, assistantId),
          eq(databaseSchema.assistantShare.userId, userId),
        ),
      )
      .returning();

    return removed ?? null;
  }

  async listShares(assistantId: string) {
    const shares = await this.db
      .select({
        share: databaseSchema.assistantShare,
        user: databaseSchema.user,
      })
      .from(databaseSchema.assistantShare)
      .innerJoin(databaseSchema.user, eq(databaseSchema.user.id, databaseSchema.assistantShare.userId))
      .where(eq(databaseSchema.assistantShare.assistantId, assistantId));

    return shares;
  }
}
