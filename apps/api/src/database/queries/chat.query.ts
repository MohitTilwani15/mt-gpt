import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gt, lt, SQL } from 'drizzle-orm';
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
  }: {
    id: string;
    userId: string;
    title?: string;
  }) {
    try {
      return await this.db.insert(chat).values({
        id,
        userId,
        title,
        createdAt: new Date(),
      });
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
              ? and(whereCondition, eq(chat.userId, id))
              : eq(chat.userId, id),
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
}
