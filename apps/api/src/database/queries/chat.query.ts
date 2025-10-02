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
    title,
    assistantId,
  }: {
    id: string;
    userId: string;
    title?: string;
    assistantId?: string | null;
  }) {
    try {
      const [chatRow] = await this.db
        .insert(chat)
        .values({
          id,
          userId,
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

  async getChatsByUserId({
    id,
    limit,
    startingAfter,
    endingBefore,
  }: {
    id: string;
    limit: number;
    startingAfter: string | null;
    endingBefore: string | null;
  }) {
    try {
      const extendedLimit = limit + 1;

      const query = (whereCondition?: SQL<any>) =>
        this.db
          .select()
          .from(chat)
          .where(
            whereCondition
              ? and(eq(chat.userId, id), eq(chat.isArchived, false), whereCondition)
              : and(eq(chat.userId, id), eq(chat.isArchived, false)),
          )
          .orderBy(desc(chat.createdAt))
          .limit(extendedLimit);

      let filteredChats: Array<Chat> = [];

      if (startingAfter) {
        const [selectedChat] = await this.db
          .select()
          .from(chat)
          .where(eq(chat.id, startingAfter))
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
          .where(eq(chat.id, endingBefore))
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

  async getChatById({ id }: { id: string }) {
    try {
      const [selectedChat] = await this.db.select().from(chat).where(eq(chat.id, id));
      return selectedChat;
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
    }
  }

  async updateChatLastContextById({
    chatId,
    context,
  }: {
    chatId: string;
    context: LanguageModelV2Usage;
  }) {
    try {
      return await this.db
        .update(chat)
        .set({ lastContext: context })
        .where(eq(chat.id, chatId));
    } catch (error) {
      console.warn('Failed to update lastContext for chat', chatId, error);
      return;
    }
  }

  async deleteChatById(id: string) {
    try {
      await this.db.delete(chat).where(eq(chat.id, id));
      return { id };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to delete chat');
    }
  }

  async updateChatVisibilityById({ id, isPublic }: { id: string; isPublic: boolean }) {
    try {
      await this.db.update(chat).set({ isPublic }).where(eq(chat.id, id));
      return { id, isPublic };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to update chat visibility');
    }
  }

  async updateChatArchiveStateById({ id, isArchived }: { id: string; isArchived: boolean }) {
    try {
      await this.db.update(chat).set({ isArchived }).where(eq(chat.id, id));
      return { id, isArchived };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to update chat archive state');
    }
  }

  async updateChatTitleById({ id, title }: { id: string; title: string }) {
    try {
      await this.db.update(chat).set({ title }).where(eq(chat.id, id));
      return { id, title };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to update chat title');
    }
  }

  async assignAssistantToChat({ chatId, assistantId }: { chatId: string; assistantId: string }) {
    try {
      const [updated] = await this.db
        .update(chat)
        .set({ assistantId })
        .where(eq(chat.id, chatId))
        .returning();

      return updated;
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to assign assistant to chat');
    }
  }

  async searchChatsByTitle({
    userId,
    term,
    limit = 10,
  }: {
    userId: string;
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
