import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, asc, gte, desc, sql } from 'drizzle-orm';
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

  async searchChatsByMessageTerm(params: { userId: string; term: string; limit?: number }) {
    const { userId, term, limit = 10 } = params;

    const likeValue = `%${term.toLowerCase()}%`;

    // Search only text parts for messages that belong to user's chats
    const rows = await this.db
      .select({
        chatId: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        messageId: message.id,
        snippet: databaseSchema.parts.text_text,
      })
      .from(databaseSchema.parts)
      .innerJoin(message, eq(databaseSchema.parts.messageId, message.id))
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, userId),
          eq(databaseSchema.parts.type, 'text'),
          sql`LOWER(${databaseSchema.parts.text_text}) LIKE ${likeValue}`,
        ),
      )
      .orderBy(desc(message.createdAt))
      .limit(limit);

    // Group by chat to provide one snippet per chat (latest match wins due to orderBy)
    const seen = new Set<string>();
    const unique = [] as Array<{ chatId: string; title: string | null; createdAt: Date; snippet: string | null }>;
    for (const r of rows) {
      if (seen.has(r.chatId)) continue;
      seen.add(r.chatId);
      unique.push({ chatId: r.chatId, title: r.title, createdAt: r.createdAt, snippet: r.snippet });
    }

    return unique;
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
