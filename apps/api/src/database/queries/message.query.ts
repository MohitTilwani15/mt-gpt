import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, asc, gte, count, inArray } from 'drizzle-orm';
import { UIMessage } from 'ai';

import { ChatSDKError } from "../../lib/errors";
import { chat, DBMessage, message } from "../schemas/conversation.schema";
import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';
import { mapDBPartToUIMessagePart, mapUIMessagePartsToDBParts } from '../../lib/message-mapping'

@Injectable()
export class MessageQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async upsertMessage({
    messageId,
    chatId,
    message,
  }: {
    messageId: string;
    chatId: string;
    message: UIMessage;
  }) {
    const mappedDBUIParts = mapUIMessagePartsToDBParts(message.parts, messageId);
  
    await this.db.transaction(async (tx) => {
      await tx
        .insert(databaseSchema.message)
        .values({
          id: messageId,
          chatId,
          role: message.role,
        })
        .onConflictDoUpdate({
          target: databaseSchema.message.id,
          set: {
            chatId,
          },
        });
  
      await tx.delete(databaseSchema.parts).where(eq(databaseSchema.parts.messageId, messageId));

      if (mappedDBUIParts.length > 0) {
        await tx.insert(databaseSchema.parts).values(mappedDBUIParts);
      }
    });
  };

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
    const getMessageById = async (id: string) => {
      const [row] = await this.db
        .select()
        .from(message)
        .where(eq(message.id, id))
        .limit(1);
      return row ?? null;
    };

    const extendedLimit = limit + 1;
    let whereCondition = eq(message.chatId, chatId);

    try {
      if (startingAfter) {
        const cursorMsg = await getMessageById(startingAfter);
        if (cursorMsg) {
          whereCondition = and(whereCondition, gte(message.createdAt, cursorMsg.createdAt));
        }
      } else if (endingBefore) {
        const cursorMsg = await getMessageById(endingBefore);
        if (cursorMsg) {
          whereCondition = and(whereCondition, gte(message.createdAt, cursorMsg.createdAt));
        }
      }

      const messages = await this.db.query.message.findMany({
        where: whereCondition,
        with: {
          parts: {
            orderBy: (parts, { asc }) => [asc(parts.order)],
          },
        },
        orderBy: (message, { asc }) => [asc(message.createdAt), asc(message.id)],
        limit: extendedLimit,
      });

      const hasMore = messages.length > limit;
      const page = hasMore ? messages.slice(0, limit) : messages;

      const mapped = page.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts.map(mapDBPartToUIMessagePart),
      }));

      const firstId = mapped[0]?.id;
      const lastId = mapped[mapped.length - 1]?.id;

      return {
        messages: mapped,
        hasMore,
        nextCursor: lastId,
        prevCursor: firstId,
      };
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get paginated messages by chat id');
    }
  }
}
