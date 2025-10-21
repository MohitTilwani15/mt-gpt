import { Injectable, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';
import { applyDefaultCache } from '../utils/cache';
import type { AssistantCapabilities } from '../schemas/assistant.schema';

interface CreateAssistantParams {
  ownerId: string;
  tenantId: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  defaultModel?: string | null;
  capabilities?: AssistantCapabilities;
}

interface UpdateAssistantParams {
  assistantId: string;
  ownerId: string;
  tenantId: string;
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

  private readonly cacheTtlSeconds = 60;

  async createAssistant(params: CreateAssistantParams) {
    const { ownerId, tenantId, name, description, instructions, defaultModel, capabilities } = params;

    const [assistant] = await this.db
      .insert(databaseSchema.assistant)
      .values({
        ownerId,
        name,
        tenantId,
        description: description ?? null,
        instructions: instructions ?? null,
        defaultModel: defaultModel ?? null,
        capabilities: capabilities ?? {},
      })
      .returning();

    return assistant;
  }

  async updateAssistant(params: UpdateAssistantParams) {
    const { assistantId, ownerId, tenantId, ...updates } = params;

    const updatePayload: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.instructions !== undefined) updatePayload.instructions = updates.instructions;
    if (updates.defaultModel !== undefined) updatePayload.defaultModel = updates.defaultModel;
    if (updates.capabilities !== undefined) updatePayload.capabilities = updates.capabilities;

    const [assistant] = await this.db
      .update(databaseSchema.assistant)
      .set(updatePayload)
      .where(and(
        eq(databaseSchema.assistant.id, assistantId),
        eq(databaseSchema.assistant.ownerId, ownerId),
        eq(databaseSchema.assistant.tenantId, tenantId),
      ))
      .returning();

    return assistant ?? null;
  }

  async deleteAssistant(assistantId: string, ownerId: string, tenantId: string) {
    const [deleted] = await this.db
      .delete(databaseSchema.assistant)
      .where(and(
        eq(databaseSchema.assistant.id, assistantId),
        eq(databaseSchema.assistant.ownerId, ownerId),
        eq(databaseSchema.assistant.tenantId, tenantId),
      ))
      .returning();

    return deleted ?? null;
  }

  async getAssistantById(assistantId: string, tenantId?: string) {
    const [assistant] = await applyDefaultCache(
      this.db
        .select()
        .from(databaseSchema.assistant)
        .where(tenantId
          ? and(eq(databaseSchema.assistant.id, assistantId), eq(databaseSchema.assistant.tenantId, tenantId))
          : eq(databaseSchema.assistant.id, assistantId)),
      `assistant:${assistantId}:base`,
      this.cacheTtlSeconds,
    );

    if (!assistant) {
      return null;
    }

    const [knowledge, shares] = await Promise.all([
      applyDefaultCache(
        this.db
          .select()
          .from(databaseSchema.assistantKnowledge)
          .where(and(
            eq(databaseSchema.assistantKnowledge.assistantId, assistantId),
            eq(databaseSchema.assistantKnowledge.tenantId, assistant.tenantId),
          )),
        `assistant:${assistantId}:knowledge`,
        this.cacheTtlSeconds,
      ),
      applyDefaultCache(
        this.db
          .select()
          .from(databaseSchema.assistantShare)
          .where(and(
            eq(databaseSchema.assistantShare.assistantId, assistantId),
            eq(databaseSchema.assistantShare.tenantId, assistant.tenantId),
          )),
        `assistant:${assistantId}:shares`,
        this.cacheTtlSeconds,
      ),
    ]);

    return {
      ...assistant,
      knowledge,
      shares,
    };
  }

  async getAssistantForUser(assistantId: string, userId: string, tenantId: string) {
    const assistant = await this.getAssistantById(assistantId, tenantId);

    if (!assistant) {
      return null;
    }

    if (assistant.ownerId === userId) {
      return assistant;
    }

    const shareMatches = await applyDefaultCache(
      this.db
        .select({ share: databaseSchema.assistantShare })
        .from(databaseSchema.assistantShare)
        .where(
          and(
            eq(databaseSchema.assistantShare.assistantId, assistantId),
            eq(databaseSchema.assistantShare.tenantId, tenantId),
            eq(databaseSchema.assistantShare.userId, userId),
          ),
        ),
      `assistant:${assistantId}:share:${userId}:tenant:${tenantId}`,
      this.cacheTtlSeconds,
    );

    return shareMatches.length > 0 ? assistant : null;
  }

  async listAssistantsForUser(userId: string, tenantId: string) {
    const owned = await applyDefaultCache(
      this.db
        .select()
        .from(databaseSchema.assistant)
        .where(and(
          eq(databaseSchema.assistant.ownerId, userId),
          eq(databaseSchema.assistant.tenantId, tenantId),
        )),
      `user:${userId}:tenant:${tenantId}:assistants:owned`,
      this.cacheTtlSeconds,
    );

    const sharedRows = await applyDefaultCache(
      this.db
        .select({ assistant: databaseSchema.assistant })
        .from(databaseSchema.assistantShare)
        .innerJoin(
          databaseSchema.assistant,
          eq(databaseSchema.assistantShare.assistantId, databaseSchema.assistant.id),
        )
        .where(and(
          eq(databaseSchema.assistantShare.userId, userId),
          eq(databaseSchema.assistantShare.tenantId, tenantId),
        )),
      `user:${userId}:tenant:${tenantId}:assistants:shared`,
      this.cacheTtlSeconds,
    );

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

  async upsertShare(params: { assistantId: string; tenantId: string; userId: string; canManage?: boolean }) {
    const { assistantId, tenantId, userId, canManage = false } = params;

    const [share] = await this.db
      .insert(databaseSchema.assistantShare)
        .values({
          assistantId,
          tenantId,
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

  async removeShare(params: { assistantId: string; tenantId: string; userId: string }) {
    const { assistantId, tenantId, userId } = params;

    const [removed] = await this.db
      .delete(databaseSchema.assistantShare)
      .where(
        and(
          eq(databaseSchema.assistantShare.assistantId, assistantId),
          eq(databaseSchema.assistantShare.tenantId, tenantId),
          eq(databaseSchema.assistantShare.userId, userId),
        ),
      )
      .returning();

    return removed ?? null;
  }

  async listShares(assistantId: string, tenantId: string) {
    const shares = await applyDefaultCache(
      this.db
        .select({
          share: databaseSchema.assistantShare,
          user: databaseSchema.user,
        })
        .from(databaseSchema.assistantShare)
        .innerJoin(
          databaseSchema.user,
          eq(databaseSchema.user.id, databaseSchema.assistantShare.userId),
        )
        .where(and(
          eq(databaseSchema.assistantShare.assistantId, assistantId),
          eq(databaseSchema.assistantShare.tenantId, tenantId),
        )),
      `assistant:${assistantId}:shares:with-user`,
      this.cacheTtlSeconds,
    );

    return shares;
  }
}
