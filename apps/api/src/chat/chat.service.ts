import { Injectable, Inject } from '@nestjs/common';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { UserSession } from '@mguay/nestjs-better-auth';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc } from 'drizzle-orm';

import { ChatQueryService } from 'src/database/queries/chat.query';
import { MessageQueryService } from 'src/database/queries/message.query';
import { StreamQueryService } from 'src/database/queries/stream.query';
import { ChatSDKError } from 'src/lib/errors';
import { PostChatRequestDto, GetChatsQueryDto, ChatModel } from './dto/chat.dto';
import { ChatResponse } from './interfaces/chat.interface';
import { DATABASE_CONNECTION } from 'src/database/database-connection';
import { databaseSchema } from 'src/database/schemas';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatQueryService: ChatQueryService,
    private readonly messageQueryService: MessageQueryService,
    private readonly streamQueryService: StreamQueryService,
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async createChat(requestBody: PostChatRequestDto, session: UserSession) {
    const { id, message, selectedChatModel } = requestBody;
    
    const existingChat = await this.chatQueryService.getChatById({ id });
    if (existingChat && existingChat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    return this.db.transaction(async (transaction) => {
      if (!existingChat) {
        const title = await this.generateTitleFromUserMessage(message);
        
        await transaction.insert(databaseSchema.chat).values({
          id,
          createdAt: new Date(),
          userId: session.user.id,
          title,
        });
      }

      await transaction.insert(databaseSchema.message).values({
        chatId: id,
        id: message.id,
        role: 'user',
        parts: message.parts,
        attachments: [],
        createdAt: new Date(),
      });

      const streamId = this.generateUUID();
      await transaction.insert(databaseSchema.stream).values({
        id: streamId,
        chatId: id,
        createdAt: new Date(),
      });

      const messagesFromDb = await transaction
        .select()
        .from(databaseSchema.message)
        .where(eq(databaseSchema.message.chatId, id))
        .orderBy(asc(databaseSchema.message.createdAt));
      
      const uiMessages = [...this.convertToUIMessages(messagesFromDb), message];

      return this.generateAIResponse({
        messages: uiMessages,
        selectedChatModel,
      });
    });
  }

  async getChats(userId: string, query: { limit: number; startingAfter?: string; endingBefore?: string }): Promise<ChatResponse> {
    return this.chatQueryService.getChatsByUserId({
      id: userId,
      limit: query.limit,
      startingAfter: query.startingAfter || null,
      endingBefore: query.endingBefore || null,
    });
  }

  async getChatById(chatId: string, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });
    
    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    return chat;
  }

  async deleteChat(chatId: string, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });
    
    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    return this.chatQueryService.deleteChatById({ id: chatId });
  }

  async getChatStream(chatId: string, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });
    
    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    const streamIds = await this.streamQueryService.getStreamIdsByChatId({ chatId });
    
    if (!streamIds.length) {
      throw new ChatSDKError('not_found:stream');
    }

    return streamIds;
  }

  private async generateAIResponse({
    messages,
    selectedChatModel,
  }: {
    messages: any[];
    selectedChatModel: ChatModel;
  }) {
    const result = streamText({
      model: openai(selectedChatModel),
      messages: this.convertToModelMessages(messages),
      system: this.getSystemPrompt(selectedChatModel),
    });

    return result.pipeUIMessageStreamToResponse;
  }

  private async generateTitleFromUserMessage(message: any): Promise<string> {
    const firstPart = message.parts[0]?.text || 'New Chat';
    return firstPart.substring(0, 50) + (firstPart.length > 50 ? '...' : '');
  }

  private convertToUIMessages(messages: any[]): any[] {
    return messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      parts: msg.parts,
      attachments: msg.attachments,
    }));
  }

  private convertToModelMessages(messages: any[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.parts.map((part: any) => part.text).join(''),
    }));
  }

  private getSystemPrompt(selectedChatModel: ChatModel): string {
    return `You are a helpful AI assistant. Please provide clear and helpful responses.`;
  }

  async getVotesByChatId(chatId: string, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });
    
    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:vote');
    }

    return this.chatQueryService.getVotesByChatId({ chatId });
  }

  async voteMessage(
    chatId: string,
    messageId: string,
    type: 'up' | 'down',
    session: UserSession,
  ) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });
    
    if (!chat) {
      throw new ChatSDKError('not_found:vote');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:vote');
    }

    await this.messageQueryService.voteMessage({
      chatId,
      messageId,
      type,
    });
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}