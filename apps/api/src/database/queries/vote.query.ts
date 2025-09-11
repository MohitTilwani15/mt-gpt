import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';

import { ChatSDKError } from "../../lib/errors";
import { vote, message, chat } from "../schemas/conversation.schema";
import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';
import { VoteMessageDto } from '../../chat/dto/chat.dto';

@Injectable()
export class VoteQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async updateVote(request: VoteMessageDto, userId: string) {
    const chatRecord = await this.db
      .select()
      .from(chat)
      .where(and(eq(chat.id, request.chatId), eq(chat.userId, userId)))
      .limit(1);

    if (chatRecord.length === 0) {
      throw new ChatSDKError('forbidden:vote');
    }

    const messageRecord = await this.db
      .select()
      .from(message)
      .where(and(eq(message.id, request.messageId), eq(message.chatId, request.chatId)))
      .limit(1);

    if (messageRecord.length === 0) {
      throw new ChatSDKError('not_found:vote');
    }

    const [result] = await this.db
      .insert(vote)
      .values({
        chatId: request.chatId,
        messageId: request.messageId,
        isUpvoted: request.type === 'up',
      })
      .onConflictDoUpdate({
        target: [vote.chatId, vote.messageId],
        set: {
          isUpvoted: request.type === 'up',
        },
      })
      .returning();

    return result;
  }

  async getVotes(chatId: string, userId: string) {
    const chatRecord = await this.db
      .select()
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .limit(1);

    if (chatRecord.length === 0) {
      throw new ChatSDKError('forbidden:vote');
    }

    // Get all votes for the chat
    const votes = await this.db
      .select()
      .from(vote)
      .where(eq(vote.chatId, chatId));

    return votes;
  }

  async getVoteForMessage(chatId: string, messageId: string, userId: string) {
    const chatRecord = await this.db
      .select()
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .limit(1);

    if (chatRecord.length === 0) {
      throw new ChatSDKError('forbidden:vote');
    }

    const [voteRecord] = await this.db
      .select()
      .from(vote)
      .where(and(eq(vote.chatId, chatId), eq(vote.messageId, messageId)))
      .limit(1);

    return voteRecord || null;
  }
}