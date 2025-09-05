import { Injectable } from '@nestjs/common';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { UserSession } from '@mguay/nestjs-better-auth';

import { ChatQueryService } from 'src/database/queries/chat.query';
import { MessageQueryService } from 'src/database/queries/message.query';
import { StreamQueryService } from 'src/database/queries/stream.query';
import { ChatSDKError } from 'src/lib/errors';
import { PostChatRequestDto, GetChatsQueryDto, ChatModel } from './dto/chat.dto';
import { ChatResponse } from './interfaces/chat.interface';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatQueryService: ChatQueryService,
    private readonly messageQueryService: MessageQueryService,
    private readonly streamQueryService: StreamQueryService,
  ) {}

  async createChat(requestBody: PostChatRequestDto, session: UserSession) {
    const { id, message, selectedChatModel } = requestBody;

    const existingChat = await this.chatQueryService.getChatById({ id });

    if (!existingChat) {
      const title = await this.generateTitleFromUserMessage(message);

      await this.chatQueryService.saveChat({
        id,
        userId: session.user.id,
        title,
      });
    } else {
      if (existingChat.userId !== session.user.id) {
        throw new ChatSDKError('forbidden:chat');
      }
    }

    const messagesFromDb = await this.messageQueryService.getMessagesByChatId({ chatId: id });
    const uiMessages = [...this.convertToUIMessages(messagesFromDb), message];

    await this.messageQueryService.saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = this.generateUUID();
    await this.streamQueryService.createStreamId({ streamId, chatId: id });

    return this.generateAIResponse({
      messages: uiMessages,
      selectedChatModel,
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