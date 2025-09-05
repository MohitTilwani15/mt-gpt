import { Injectable, Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc } from 'drizzle-orm';

import { ChatSDKError } from "../../lib/errors";
import { stream } from '../schemas/stream.schema';
import { DATABASE_CONNECTION } from '../database-connection';

@Injectable()
export class StreamQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase,
  ) {}

  async createStreamId({
    streamId,
    chatId,
  }: {
    streamId: string;
    chatId: string;
  }) {
    try {
      await this.db
        .insert(stream)
        .values({ id: streamId, chatId, createdAt: new Date() });
    } catch (error) {
      throw new ChatSDKError(
        'bad_request:database',
        'Failed to create stream id',
      );
    }
  }
  
  async getStreamIdsByChatId({ chatId }: { chatId: string }) {
    try {
      const streamIds = await this.db
        .select({ id: stream.id })
        .from(stream)
        .where(eq(stream.chatId, chatId))
        .orderBy(asc(stream.createdAt))
        .execute();
  
      return streamIds.map(({ id }) => id);
    } catch (error) {
      throw new ChatSDKError(
        'bad_request:database',
        'Failed to get stream ids by chat id',
      );
    }
  }
}
