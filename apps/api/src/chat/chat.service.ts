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
import { Mem0MemoryService } from './services/mem0-memory.service';
import { CloudflareAIGatewayService } from 'src/services/cloudflare-ai-gateway.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatQueryService: ChatQueryService,
    private readonly messageQueryService: MessageQueryService,
    private readonly voteQueryService: VoteQueryService,
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly linkupsoWebSearchToolService: LinkUpSoWebSearchToolService,
    private readonly mem0MemoryService: Mem0MemoryService,
    private readonly cloudflareAIGatewayService: CloudflareAIGatewayService,
  ) {}

  async createChat(requestBody: PostChatRequestDto, session: UserSession, abortSignal?: AbortSignal) {
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

      const dbMessages = await transaction.query.message.findMany({
        where: eq(databaseSchema.message.chatId, existingChat.id),
        with: {
          parts: {
            orderBy: (parts, { asc }) => [asc(parts.order)],
          },
        },
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 4,
      });

      const messages = dbMessages.reverse().map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts.map((part) => mapDBPartToUIMessagePart(part)),
      }));

      const userQueryText = this.extractTextFromParts(message.parts || []);

      let memoryContext = '';
      try {
        memoryContext = await this.mem0MemoryService.getMemoryContext(
          session.user.id,
          userQueryText,
          5
        );
      } catch (err) {
        console.warn('Memory retrieval failed', err);
      }

      return this.generateAIResponse({
        chatId: id,
        messages,
        selectedChatModel,
        message,
        abortSignal,
        userId: session.user.id,
        additionalSystemContext: memoryContext,
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

  async searchChatsByMessageTerm(params: { userId: string; term: string; limit?: number }) {
    return this.messageQueryService.searchChatsByMessageTerm(params);
  }

  async deleteChatById(chatId: string, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });

    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    await this.chatQueryService.deleteChatById(chatId);
    return { id: chatId, deleted: true };
  }

  async updateChatVisibilityById(chatId: string, isPublic: boolean, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });

    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    return await this.chatQueryService.updateChatVisibilityById({ id: chatId, isPublic });
  }

  private async generateAIResponse({
    chatId,
    messages,
    selectedChatModel,
    message,
    abortSignal,
    userId,
    additionalSystemContext,
  }: {
    chatId: string;
    messages: UIMessage[];
    selectedChatModel: ChatModel;
    message: UIMessage;
    abortSignal?: AbortSignal;
    userId: string;
    additionalSystemContext?: string;
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

        // let model;
        // if (selectedChatModel === 'grok-3-mini' || selectedChatModel === 'grok-3') {
        //   model = xai(selectedChatModel);
        // } else {
        //   model = openai(selectedChatModel || 'gpt-4o');
        // }

        const systemPrompt = [this.getSystemPrompt(), additionalSystemContext]
          .filter(Boolean)
          .join('');

        const result = streamText({
          model: this.cloudflareAIGatewayService.aigateway([openai(selectedChatModel || 'gpt-4o')]),
          system: systemPrompt,
          messages: convertToModelMessages(messages),
          stopWhen: stepCountIs(5),
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'chat',
            metadata: {
              userId: userId,
              chatId: chatId,
              model: selectedChatModel,
            },
          },
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
          },
          abortSignal,
        });

        result.consumeStream();

        dataStream.merge(result.toUIMessageStream({ sendReasoning: true, sendSources: true }));
      },
      generateId: uuidv4,
      onFinish: async ({ responseMessage, isAborted }) => {
        try {
          const userTextFull = this.extractTextFromParts(message.parts || []);
          const aiResponseText = this.extractTextFromParts(responseMessage.parts || []);
          
          if (userTextFull && userTextFull.trim() && aiResponseText && aiResponseText.trim()) {
            await this.mem0MemoryService.addMemory({
              userId,
              chatId,
              messageId: message.id,
              messages: [
                { role: 'user', content: userTextFull },
                { role: 'assistant', content: aiResponseText }
              ],
              metadata: {
                chatId,
                messageId: message.id,
                responseMessageId: responseMessage.id
              }
            });
          }
        } catch (err) {
          console.warn('Conversation memory write failed', err);
        }

        if (isAborted) {
          return
        }

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

  private extractTextFromParts(parts: UIMessage['parts'] | undefined): string {
    if (!parts) return '';
    return parts
      .filter((p: any) => p?.type === 'text' && typeof (p as any).text === 'string')
      .map((p: any) => (p as any).text)
      .join(' ')
      .slice(0, 4000);
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
