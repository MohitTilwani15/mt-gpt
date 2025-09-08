import { v4 as uuidv4 } from 'uuid';
import { Injectable, Inject } from '@nestjs/common';
import { streamText, generateText, createUIMessageStream, stepCountIs, smoothStream, JsonToSseTransformStream } from 'ai';
import { openai } from '@ai-sdk/openai';
import { UserSession } from '@mguay/nestjs-better-auth';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc } from 'drizzle-orm';

import { ChatQueryService } from 'src/database/queries/chat.query';
import { MessageQueryService } from 'src/database/queries/message.query';
import { DocumentQueryService } from 'src/database/queries/document.query';
import { ChatSDKError } from 'src/lib/errors';
import { PostChatRequestDto, GetMessagesQueryDto, ChatModel } from './dto/chat.dto';
import { ChatResponse } from './interfaces/chat.interface';
import { DATABASE_CONNECTION } from 'src/database/database-connection';
import { databaseSchema } from 'src/database/schemas';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatQueryService: ChatQueryService,
    private readonly messageQueryService: MessageQueryService,
    private readonly documentQueryService: DocumentQueryService,
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async createChat(requestBody: PostChatRequestDto, session: UserSession) {
    const { id, messages, selectedChatModel, documentIds } = requestBody;
    
    const existingChat = await this.chatQueryService.getChatById({ id });
    if (existingChat && existingChat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    return this.db.transaction(async (transaction) => {
      if (!existingChat) {
        const title = await this.generateTitleFromUserMessage(messages[messages.length - 1].parts.map(part => part.text).join(' '));
        
        await transaction.insert(databaseSchema.chat).values({
          id,
          createdAt: new Date(),
          userId: session.user.id,
          title,
        });
      }
      
      const existingMessage = await transaction
        .select()
        .from(databaseSchema.message)
        .where(eq(databaseSchema.message.id, messages[messages.length - 1].id))
        .limit(1);

      if (!existingMessage.length) {
        const messageInsert = await transaction.insert(databaseSchema.message).values({
          chatId: id,
          id: messages[messages.length - 1].id,
          role: 'user',
          parts: messages[messages.length - 1].parts,
          attachments: [],
          createdAt: new Date(),
        }).returning();

        const insertedMessageId = messageInsert[0].id;

        if (documentIds && documentIds.length > 0) {
          const linkPromises = documentIds.map(documentId =>
            transaction.insert(databaseSchema.messageDocument).values({
              messageId: insertedMessageId,
              documentId,
            })
          );
          await Promise.all(linkPromises);
        }
      }

      const streamId = uuidv4();
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
      
      const uiMessages = [...this.convertToUIMessages(messagesFromDb), ...messages];

      return this.generateAIResponse({
        chatId: id,
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

    const messages = await this.messageQueryService.getMessagesByChatId({ chatId });
    
    if (!messages.length) {
      throw new ChatSDKError('not_found:stream');
    }

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        messages.forEach((message) => {
          dataStream.write({
            type: 'data-message',
            data: {
              id: message.id,
              role: message.role,
              parts: message.parts,
              attachments: message.attachments,
            },
          });
        });
        
        dataStream.write({
          type: 'finish',
        });
      },
      generateId: uuidv4,
      onFinish: async () => {
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    return stream;
  }

  private async generateAIResponse({
    chatId,
    messages,
    selectedChatModel,
  }: {
    chatId: string;
    messages: any[];
    selectedChatModel: ChatModel;
  }) {
    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        let contextPrompt = '';
        const lastUserMessage = messages[messages.length - 1];

        if (lastUserMessage && lastUserMessage.role === 'user') {
          const userQuery = lastUserMessage.parts.map((part: any) => part.text).join(' ');

          try {
            const relevantDocs = await this.documentQueryService.searchDocuments({
              chatId,
              query: userQuery,
              limit: 3,
            });
            
            if (relevantDocs.length > 0) {
              contextPrompt = '\n\nRelevant context from uploaded documents:\n';
              relevantDocs.forEach(doc => {
                contextPrompt += `\n---\n${doc.text}\n---\n`;
              });
              contextPrompt += '\nPlease use the above context to inform your response. ';
            }
          } catch (error) {
            console.error('Error searching documents:', error);
          }
        }

        const result = streamText({
          model: openai(selectedChatModel || 'gpt-4o'),
          system: this.getSystemPrompt(selectedChatModel) + contextPrompt,
          messages: this.convertToModelMessages(messages),
          stopWhen: stepCountIs(5),
          experimental_transform: smoothStream({ chunking: 'word' }),
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          }),
        );
      },
      generateId: uuidv4,
      onFinish: async ({ messages }) => {
        await this.messageQueryService.saveMessages({
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt: new Date(),
            attachments: [],
            chatId,
          })),
        });
      },
      onError: () => {
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