import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gt, lt, SQL, sql } from 'drizzle-orm';
import { LanguageModelV2Usage } from '@ai-sdk/provider';

import { ChatSDKError } from "../../lib/errors";
import { Chat, chat } from "../schemas/conversation.schema";
import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';

@Injectable()
export class ChatQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async createChat({
    id,
    userId,
    tenantId,
    title,
    assistantId,
  }: {
    id: string;
    userId: string;
    tenantId: string;
    title?: string;
    assistantId?: string | null;
  }) {
    try {
      const [chatRow] = await this.db
        .insert(chat)
        .values({
          id,
          userId,
          tenantId,
          title,
          createdAt: new Date(),
          assistantId: assistantId ?? null,
        })
        .returning({
          id: chat.id,
          title: chat.title,
          userId: chat.userId,
          createdAt: chat.createdAt,
          assistantId: chat.assistantId,
          isPublic: chat.isPublic,
          isArchived: chat.isArchived,
        });

      return chatRow;
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to save chat');
    }
  }

  async getChatsForTenant({
    userId,
    tenantId,
    limit,
    startingAfter,
    endingBefore,
  }: {
    userId: string;
    tenantId: string;
    limit: number;
    startingAfter: string | null;
    endingBefore: string | null;
  }) {
    try {
      const extendedLimit = limit + 1;

      const baseWhere = and(
        eq(chat.userId, userId),
        eq(chat.tenantId, tenantId),
        eq(chat.isArchived, false),
      );

      const query = (whereCondition?: SQL<any>) =>
        this.db
          .select()
          .from(chat)
          .where(whereCondition ? and(baseWhere, whereCondition) : baseWhere)
          .orderBy(desc(chat.createdAt))
          .limit(extendedLimit);

      let filteredChats: Array<Chat> = [];

      if (startingAfter) {
        const [selectedChat] = await this.db
          .select()
          .from(chat)
          .where(and(eq(chat.id, startingAfter), eq(chat.tenantId, tenantId)))
          .limit(1);

        if (!selectedChat) {
          throw new ChatSDKError(
            'not_found:database',
            `Chat with id ${startingAfter} not found`,
          );
        }

        filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
      } else if (endingBefore) {
        const [selectedChat] = await this.db
          .select()
          .from(chat)
          .where(and(eq(chat.id, endingBefore), eq(chat.tenantId, tenantId)))
          .limit(1);

        if (!selectedChat) {
          throw new ChatSDKError(
            'not_found:database',
            `Chat with id ${endingBefore} not found`,
          );
        }

        filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
      } else {
        filteredChats = await query();
      }

      const hasMore = filteredChats.length > limit;

      return {
        chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
        hasMore,
      };
    } catch (error) {
      throw new ChatSDKError(
        'bad_request:database',
        'Failed to get chats by user id',
      );
    }
  }

  async getChatById({ id, tenantId }: { id: string; tenantId?: string }) {
    try {
      const whereClause = tenantId
        ? and(eq(chat.id, id), eq(chat.tenantId, tenantId))
        : eq(chat.id, id);
      const [selectedChat] = await this.db.select().from(chat).where(whereClause);
      return selectedChat;
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
    }
  }

  async updateChatLastContextById({
    chatId,
    tenantId,
    context,
  }: {
    chatId: string;
    tenantId: string;
    context: LanguageModelV2Usage;
  }) {
    try {
      return await this.db
        .update(chat)
        .set({ lastContext: context })
        .where(and(eq(chat.id, chatId), eq(chat.tenantId, tenantId)));
    } catch (error) {
      console.warn('Failed to update lastContext for chat', chatId, error);
      return;
    }
  }

  async deleteChatById(id: string, tenantId: string) {
    try {
      await this.db.delete(chat).where(and(eq(chat.id, id), eq(chat.tenantId, tenantId)));
      return { id };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to delete chat');
    }
  }

  async updateChatVisibilityById({ id, tenantId, isPublic }: { id: string; tenantId: string; isPublic: boolean }) {
    try {
      await this.db.update(chat).set({ isPublic }).where(and(eq(chat.id, id), eq(chat.tenantId, tenantId)));
      return { id, isPublic };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to update chat visibility');
    }
  }

  async updateChatArchiveStateById({ id, tenantId, isArchived }: { id: string; tenantId: string; isArchived: boolean }) {
    try {
      await this.db.update(chat).set({ isArchived }).where(and(eq(chat.id, id), eq(chat.tenantId, tenantId)));
      return { id, isArchived };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to update chat archive state');
    }
  }

  async updateChatTitleById({ id, tenantId, title }: { id: string; tenantId: string; title: string }) {
    try {
      await this.db.update(chat).set({ title }).where(and(eq(chat.id, id), eq(chat.tenantId, tenantId)));
      return { id, title };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to update chat title');
    }
  }

  async assignAssistantToChat({ chatId, tenantId, assistantId }: { chatId: string; tenantId: string; assistantId: string }) {
    try {
      const [updated] = await this.db
        .update(chat)
        .set({ assistantId })
        .where(and(eq(chat.id, chatId), eq(chat.tenantId, tenantId)))
        .returning();

      return updated;
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to assign assistant to chat');
    }
  }

  async searchChatsByTitle({
    userId,
    tenantId,
    term,
    limit = 10,
  }: {
    userId: string;
    tenantId: string;
    term: string;
    limit?: number;
  }) {
    const likeValue = `%${term.toLowerCase()}%`;

    const rows = await this.db
      .select({
        chatId: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
      })
      .from(chat)
      .where(
        and(
          eq(chat.userId, userId),
          eq(chat.tenantId, tenantId),
          eq(chat.isArchived, false),
          sql`LOWER(${chat.title}) LIKE ${likeValue}`,
        ),
      )
      .orderBy(desc(chat.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      chatId: row.chatId,
      title: row.title,
      createdAt: row.createdAt,
      snippet: row.title,
    }));
  }
}
