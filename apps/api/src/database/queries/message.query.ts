import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, asc, gte, count, inArray } from 'drizzle-orm';

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

  async getMessagesByChatIdPaginated({
    chatId,
    limit,
    startingAfter,
    endingBefore,
  }: {
    chatId: string;
    limit: number;
    startingAfter?: string | null;
    endingBefore?: string | null;
  }) {
    try {
      let whereCondition = eq(message.chatId, chatId);

      if (startingAfter) {
        const startingMessage = await this.db
          .select({ createdAt: message.createdAt })
          .from(message)
          .where(eq(message.id, startingAfter))
          .limit(1);
        
        if (startingMessage.length > 0) {
          whereCondition = and(whereCondition, gte(message.createdAt, startingMessage[0].createdAt));
        }
      }

      if (endingBefore) {
        const endingMessage = await this.db
          .select({ createdAt: message.createdAt })
          .from(message)
          .where(eq(message.id, endingBefore))
          .limit(1);
        
        if (endingMessage.length > 0) {
          whereCondition = and(whereCondition, gte(message.createdAt, endingMessage[0].createdAt));
        }
      }

      const messages = await this.db
        .select()
        .from(message)
        .where(whereCondition)
        .orderBy(asc(message.createdAt))
        .limit(limit + 1);

      const hasMore = messages.length > limit;
      if (hasMore) {
        messages.pop();
      }

      // Fetch documents linked to the returned messages using Document.messageId
      const messageIds = messages.map((m) => m.id);
      let messageDocuments: Record<string, Array<{
        id: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        createdAt: Date;
      }>> = {};

      if (messageIds.length > 0) {
        const docs = await this.db
          .select({
            messageId: databaseSchema.document.messageId,
            id: databaseSchema.document.id,
            fileName: databaseSchema.document.fileName,
            fileSize: databaseSchema.document.fileSize,
            mimeType: databaseSchema.document.mimeType,
            createdAt: databaseSchema.document.createdAt,
          })
          .from(databaseSchema.document)
          .where(inArray(databaseSchema.document.messageId, messageIds));

        messageDocuments = docs.reduce<typeof messageDocuments>((acc, doc) => {
          if (!doc.messageId) return acc;
          if (!acc[doc.messageId]) acc[doc.messageId] = [];
          acc[doc.messageId].push({
            id: doc.id,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            createdAt: doc.createdAt,
          });
          return acc;
        }, {} as typeof messageDocuments);
      }

      return {
        messages,
        messageDocuments,
        hasMore,
        nextCursor: hasMore ? messages[messages.length - 1]?.id : null,
      };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get paginated messages by chat id');
    }
  }
}
