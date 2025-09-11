import { v4 as uuidv4 } from 'uuid';
import { Injectable, Inject } from '@nestjs/common';
import {
  streamText,
  generateText,
  createUIMessageStream,
  stepCountIs,
  smoothStream,
  convertToModelMessages,
  UIMessage,
  LanguageModelUsage,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';
import { UserSession } from '@mguay/nestjs-better-auth';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';

import { ChatQueryService } from 'src/database/queries/chat.query';
import { MessageQueryService } from 'src/database/queries/message.query';
import { VoteQueryService } from 'src/database/queries/vote.query';
import { ChatSDKError } from 'src/lib/errors';
import {
  PostChatRequestDto,
  GetMessagesQueryDto,
  VoteMessageDto,
  ChatModel,
} from './dto/chat.dto';
import { ChatResponse } from './interfaces/chat.interface';
import { DATABASE_CONNECTION } from 'src/database/database-connection';
import { databaseSchema } from 'src/database/schemas';
import { mapDBPartToUIMessagePart } from '../lib/message-mapping';
import { LinkUpSoWebSearchToolService } from '../lib/tools/linkup-so-web-search.tool'

@Injectable()
export class ChatService {
  constructor(
    private readonly chatQueryService: ChatQueryService,
    private readonly messageQueryService: MessageQueryService,
    private readonly voteQueryService: VoteQueryService,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly linkupsoWebSearchToolService: LinkUpSoWebSearchToolService
  ) {}

  async createChat(requestBody: PostChatRequestDto, session: UserSession) {
    const { id, message, selectedChatModel } = requestBody;

    const existingChat = await this.chatQueryService.getChatById({ id });
    if (existingChat && existingChat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    return this.db.transaction(async (transaction) => {
      if (existingChat && !existingChat.title) {
        const title = await this.generateTitleFromUserMessage(
          message.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join(' '),
        );

        await transaction.update(databaseSchema.chat)
          .set({ title })
          .where(eq(databaseSchema.chat.id, id));
      }

      await this.messageQueryService.upsertMessage({ messageId: message.id, chatId: id, message })

      const messages = await transaction.query.message.findMany({
        where: eq(databaseSchema.message.chatId, existingChat.id),
        with: {
          parts: {
            orderBy: (parts, { asc }) => [asc(parts.order)],
          },
        },
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });
    
      const messages1 = messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts.map((part) => mapDBPartToUIMessagePart(part)),
      }));

      return this.generateAIResponse({
        chatId: id,
        messages: messages1,
        selectedChatModel,
        message
      });
    });
  }

  async getChats(
    userId: string,
    query: { limit: number; startingAfter?: string; endingBefore?: string },
  ): Promise<ChatResponse> {
    return this.chatQueryService.getChatsByUserId({
      id: userId,
      limit: query.limit,
      startingAfter: query.startingAfter || null,
      endingBefore: query.endingBefore || null,
    });
  }

  async createNewChat(chatId: string, session: UserSession) {
    await this.chatQueryService.createChat({
      id: chatId,
      userId: session.user.id,
      title: 'New Chat',
    });

    return {
      id: chatId,
      title: 'New Chat',
      userId: session.user.id,
      createdAt: new Date(),
    };
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

  private async generateAIResponse({
    chatId,
    messages,
    selectedChatModel,
    message
  }: {
    chatId: string;
    messages: UIMessage[];
    selectedChatModel: ChatModel;
    message: UIMessage;
  }) {
    let finalUsage: LanguageModelUsage | undefined;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        // TODO: Check how below could be improved
        // let contextPrompt = '';
        // const lastMessage = messages[messages.length - 1];

        // if (lastMessage && lastMessage.role === 'user') {
        //   const userQuery = lastMessage.parts
        //     .map((part: any) => part.text)
        //     .join(' ');

        //   try {
        //     const relevantDocs =
        //       await this.documentQueryService.searchDocuments({
        //         chatId,
        //         query: userQuery,
        //         limit: 3,
        //       });

        //     if (relevantDocs.length > 0) {
        //       contextPrompt = '\n\nRelevant context from uploaded documents:\n';
        //       relevantDocs.forEach((doc) => {
        //         contextPrompt += `\n---\n${doc.text}\n---\n`;
        //       });
        //       contextPrompt +=
        //         '\nPlease use the above context to inform your response. ';
        //     }
        //   } catch (error) {
        //     console.error('Error searching documents:', error);
        //   }
        // }

        let model;
        if (selectedChatModel === 'grok-3-mini' || selectedChatModel === 'grok-3') {
          model = xai(selectedChatModel);
        } else {
          model = openai(selectedChatModel || 'gpt-4o');
        }

        const result = streamText({
          model,
          system: this.getSystemPrompt(),
          messages: convertToModelMessages(messages),
          stopWhen: stepCountIs(5),
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: {
            webSearch: this.linkupsoWebSearchToolService.askLinkupTool()
          },
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
              reasoningSummary: 'detailed'
            },
            xai: {
              reasoningEffort: 'high',
            }
          },
          onFinish: ({ usage }) => {
            finalUsage = usage
          }
        });

        result.consumeStream();

        dataStream.merge(result.toUIMessageStream({ sendReasoning: true, sendSources: true }));
      },
      generateId: uuidv4,
      onFinish: async ({ responseMessage }) => {
        await this.messageQueryService.upsertMessage({ messageId: responseMessage.id, chatId, message: responseMessage })

        if (finalUsage) {
          try {
            await this.chatQueryService.updateChatLastContextById({
              chatId,
              context: finalUsage,
            });
          } catch (err) {
            console.warn('Unable to persist last usage for chat', chatId, err);
          }
        }
      },
      onError: (error) => {
        console.error('error while streaming response', error)
        return 'Oops, an error occurred!';
      },
    });

    return stream;
  }

  private async generateTitleFromUserMessage(message: string) {
    const { text: title } = await generateText({
      model: openai('gpt-4o'),
      system: `\n
      - you will generate a short title based on the first message a user begins a conversation with
      - ensure it is not more than 80 characters long
      - the title should be a summary of the user's message
      - do not use quotes or colons`,
      prompt: message,
    });

    return title;
  }

  private getSystemPrompt(): string {
    return `You are a helpful AI assistant. Please provide clear and helpful responses.`;
  }

  async updateVote(
    request: VoteMessageDto,
    session: UserSession,
  ) {
    return await this.voteQueryService.updateVote(request, session.user.id);
  }

  async getVotes(chatId: string, session: UserSession) {
    return await this.voteQueryService.getVotes(chatId, session.user.id);
  }

  async getMessagesByChatId(
    chatId: string,
    query: GetMessagesQueryDto,
    session: UserSession,
  ) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });

    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    const limit = Number.parseInt(query.limit || '20');
    const startingAfter = query.startingAfter;
    const endingBefore = query.endingBefore;

    if (startingAfter && endingBefore) {
      throw new ChatSDKError(
        'bad_request:api',
        'Only one of starting_after or ending_before can be provided.',
      );
    }

    return this.messageQueryService.getMessagesByChatIdPaginated({
      chatId,
      limit,
      startingAfter: startingAfter || null,
      endingBefore: endingBefore || null,
    });
  }
}
