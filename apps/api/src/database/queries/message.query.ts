import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, asc, gte, count } from 'drizzle-orm';

import { ChatSDKError } from "../../lib/errors";
import { chat, DBMessage, message } from "../schemas/conversation.schema";
import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';

@Injectable()
export class MessageQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async saveMessages({ messages }: { messages: DBMessage[] }) {
    try {
      return await this.db.insert(message).values(messages);
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to save messages');
    }
  }

  async getMessagesByChatId({ chatId }: { chatId: string }) {
    try {
      return await this.db
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt));
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get messages by chat id');
    }
  }

  async getMessageById({ id }: { id: string }) {
    try {
      return await this.db.select().from(message).where(eq(message.id, id));
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get message by id');
    }
  }

  async getMessageCountByUserId({
    id,
    differenceInHours,
  }: {
    id: string;
    differenceInHours: number;
  }) {
    try {
      const twentyFourHoursAgo = new Date(
        Date.now() - differenceInHours * 60 * 60 * 1000,
      );
  
      const [stats] = await this.db
        .select({ count: count(message.id) })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, id),
            gte(message.createdAt, twentyFourHoursAgo),
            eq(message.role, 'user'),
          ),
        )
        .execute();
  
      return stats?.count ?? 0;
    } catch (error) {
      throw new ChatSDKError(
        'bad_request:database',
        'Failed to get message count by user id',
      );
    }
  }

  async voteMessage({ chatId, messageId, type }: { chatId: string, messageId: string, type: 'up' | 'down' }) {
    return this.db.transaction(async (transaction) => {
      const isUpvoted = type === 'up';
      
      await transaction
        .insert(databaseSchema.vote)
        .values({
          chatId,
          messageId,
          isUpvoted,
        })
        .onConflictDoUpdate({
          target: [databaseSchema.vote.chatId, databaseSchema.vote.messageId],
          set: {
            isUpvoted,
          },
        });
    });
  }
}
