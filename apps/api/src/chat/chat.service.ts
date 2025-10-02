import { v4 as uuidv4 } from 'uuid';
import { Injectable, Inject } from '@nestjs/common';
import { UIMessage } from 'ai';
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
import { Mem0MemoryService } from './services/mem0-memory.service';
import { AssistantQueryService } from 'src/database/queries/assistant.query';
import { AssistantKnowledgeQueryService } from 'src/database/queries/assistant-knowledge.query';
import type { AssistantCapabilities } from 'src/database/schemas/assistant.schema';
import { TextProcessingService } from './services/text-processing.service';
import { AIResponseService } from './services/ai-response.service';

type ChatSearchMatchType = 'message' | 'title';

export interface ChatSearchMatch {
  type: ChatSearchMatchType;
  snippet: string | null;
}

export interface ChatSearchResult {
  chatId: string;
  title: string | null;
  createdAt: Date;
  snippet: string | null;
  matches: ChatSearchMatch[];
}

@Injectable()
export class ChatService {
  constructor(
    private readonly chatQueryService: ChatQueryService,
    private readonly messageQueryService: MessageQueryService,
    private readonly voteQueryService: VoteQueryService,
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly mem0MemoryService: Mem0MemoryService,
    private readonly assistantQueryService: AssistantQueryService,
    private readonly assistantKnowledgeQueryService: AssistantKnowledgeQueryService,
    private readonly textProcessingService: TextProcessingService,
    private readonly aiResponseService: AIResponseService,
  ) {}

  async createChat(requestBody: PostChatRequestDto, session: UserSession, abortSignal?: AbortSignal) {
    const { id, message, enableReasoning, selectedChatModel } = requestBody;

    let effectiveModel = selectedChatModel ?? ChatModel.GPT_4O;
    let assistantContext: {
      instructions?: string | null;
      knowledgeSnippet?: string | null;
      capabilities?: AssistantCapabilities | null;
      assistantId?: string;
      name?: string;
    } | undefined;

    const existingChat = await this.chatQueryService.getChatById({ id });
    if (existingChat && existingChat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    if (requestBody.assistantId) {
      const assistant = await this.assistantQueryService.getAssistantForUser(
        requestBody.assistantId,
        session.user.id,
      );

      if (!assistant) {
        throw new ChatSDKError('not_found:assistant');
      }

      const isValidModel = (value?: string | null): value is ChatModel =>
        Boolean(value) && (Object.values(ChatModel) as string[]).includes(value as string);

      if (!requestBody.selectedChatModel && isValidModel(assistant.defaultModel)) {
        effectiveModel = assistant.defaultModel as ChatModel;
      }

      if (existingChat?.assistantId && existingChat.assistantId !== assistant.id) {
        throw new ChatSDKError('bad_request:chat', 'Chat already linked to another assistant');
      }

      if (existingChat && !existingChat.assistantId) {
        await this.chatQueryService.assignAssistantToChat({
          chatId: existingChat.id,
          assistantId: assistant.id,
        });
      } else if (!existingChat) {
        await this.chatQueryService.assignAssistantToChat({
          chatId: id,
          assistantId: assistant.id,
        }).catch(() => undefined);
      }

      const knowledgeRecords = await this.assistantKnowledgeQueryService.listKnowledge(assistant.id);
      const knowledgeSnippet = this.textProcessingService.formatKnowledgeSnippets(knowledgeRecords);

      assistantContext = {
        instructions: assistant.instructions ?? null,
        knowledgeSnippet,
        capabilities: assistant.capabilities ?? {},
        assistantId: assistant.id,
        name: assistant.name,
      };
    }

    const rawUserQueryText = this.textProcessingService.extractTextFromParts(message.parts);
    const userQueryText = this.textProcessingService.sanitizeText(rawUserQueryText);
    const shouldGenerateTitle = Boolean(
      existingChat && existingChat.title === 'New Chat' && this.textProcessingService.isValidTextContent(userQueryText),
    );

    const stream = await this.db.transaction(async (transaction) => {
      await this.messageQueryService.upsertMessage({ messageId: message.id, chatId: id, message });

      const [dbMessagesResult, memoryContextResult] = await Promise.allSettled([
        transaction.query.message.findMany({
          where: eq(databaseSchema.message.chatId, id),
          with: {
            parts: {
              orderBy: (parts, { asc }) => [asc(parts.order)],
            },
          },
          orderBy: (messages, { desc }) => [desc(messages.createdAt)],
          limit: 4,
        }),
        this.mem0MemoryService.getMemoryContext(
          session.user.id,
          userQueryText,
          5,
        )
      ])

      const dbMessages = dbMessagesResult.status === "fulfilled" ? dbMessagesResult.value : [];
      const memoryContext = memoryContextResult.status === "fulfilled" ? memoryContextResult.value : null;

      const messages = dbMessages.reverse().map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts.map((part) => mapDBPartToUIMessagePart(part)),
      }));

      let responseStream: any;

      responseStream = await this.aiResponseService.generateResponse(
        {
          chatId: id,
          messages,
          selectedChatModel: effectiveModel,
          message,
          abortSignal,
          userId: session.user.id,
          additionalSystemContext: memoryContext,
          enableReasoning: Boolean(enableReasoning),
          assistantContext,
        },
        {
          onFinish: async ({ responseMessage, isAborted }) => {
            try {
              const userTextFull = this.textProcessingService.sanitizeText(
                this.textProcessingService.extractTextFromParts(message.parts),
              );
              const aiResponseText = this.textProcessingService.sanitizeText(
                this.textProcessingService.extractTextFromParts(responseMessage.parts),
              );

              if (
                this.textProcessingService.isValidTextContent(userTextFull) &&
                this.textProcessingService.isValidTextContent(aiResponseText)
              ) {
                void this.mem0MemoryService
                  .addMemory({
                    userId: session.user.id,
                    chatId: id,
                    messageId: message.id,
                    messages: [
                      { role: 'user', content: userTextFull },
                      { role: 'assistant', content: aiResponseText },
                    ],
                    metadata: {
                      chatId: id,
                      messageId: message.id,
                      responseMessageId: responseMessage.id,
                    },
                  })
                  .catch((error) => {
                    console.warn('Conversation memory write failed', error);
                  });
              }
            } catch (err) {
              console.warn('Conversation memory write failed', err);
            }

            if (isAborted) {
              return;
            }

            await this.messageQueryService.upsertMessage({
              messageId: responseMessage.id,
              chatId: id,
              message: responseMessage,
            });

            const usage = responseStream?.getUsage?.();
            if (usage) {
              try {
                await this.chatQueryService.updateChatLastContextById({
                  chatId: id,
                  context: usage,
                });
              } catch (err) {
                console.warn('Unable to persist last usage for chat', id, err);
              }
            }
          },
        },
      );

      return responseStream;
    });

    if (shouldGenerateTitle) {
      void this.generateChatTitleInBackground({ chatId: id, userQueryText });
    }

    return stream;
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

  async createNewChat(chatId: string, session: UserSession, assistantId?: string) {
    const chat = await this.chatQueryService.createChat({
      id: chatId,
      userId: session.user.id,
      title: 'New Chat',
      assistantId: assistantId ?? undefined,
    });

    return {
      id: chat.id,
      title: chat.title,
      userId: session.user.id,
      createdAt: chat.createdAt,
      assistantId: chat.assistantId,
    };
  }

  async getChatById(chatId: string, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });

    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id && !chat.isPublic) {
      throw new ChatSDKError('forbidden:chat');
    }

    return chat;
  }

  async forkChat(chatId: string, messageId: string, session: UserSession) {
    const existingChat = await this.chatQueryService.getChatById({ id: chatId });

    if (!existingChat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (existingChat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    const messages = await this.messageQueryService.getMessagesUpToMessage({
      chatId,
      messageId,
    });

    if (messages.length === 0 || messages[messages.length - 1]?.id !== messageId) {
      throw new ChatSDKError('bad_request:chat', 'Unable to fork chat at the requested message');
    }

    const targetMessage = messages[messages.length - 1];

    if (targetMessage.role !== 'assistant') {
      throw new ChatSDKError('bad_request:chat', 'Only assistant messages can be used to fork chats');
    }

    const newChatId = uuidv4();
    const sourceTitle = existingChat.title?.trim();
    const forkTitle = sourceTitle && sourceTitle !== 'New Chat'
      ? `${sourceTitle} (Fork)`
      : 'Forked Chat';

    const forkedChat = await this.chatQueryService.createChat({
      id: newChatId,
      userId: session.user.id,
      title: forkTitle,
    });

    for (const msg of messages) {
      const clonedId = uuidv4();
      const clonedMessage: UIMessage = {
        ...msg,
        id: clonedId,
        parts: msg.parts.map((part) => ({ ...part })),
      };

      await this.messageQueryService.upsertMessage({
        messageId: clonedId,
        chatId: newChatId,
        message: clonedMessage,
      });
    }

    return forkedChat;
  }

  async searchChatsByMessageTerm(params: { userId: string; term: string; limit?: number }): Promise<ChatSearchResult[]> {
    const { userId, term, limit = 10 } = params;

    const normalizeSnippet = (value?: string | null) => {
      if (!value) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 280 ? `${trimmed.slice(0, 277)}…` : trimmed;
    };

    const expandedLimit = Math.max(limit, 10);

    const [messageMatches, titleMatches] = await Promise.all([
      this.messageQueryService.searchChatsByMessageTerm({ userId, term, limit: expandedLimit }),
      this.chatQueryService.searchChatsByTitle({ userId, term, limit: expandedLimit }),
    ]);

    const resultsMap = new Map<string, ChatSearchResult>();

    const register = (
      row: { chatId: string; title: string | null; createdAt: Date; snippet: string | null },
      matchType: ChatSearchMatchType,
    ) => {
      const snippet = normalizeSnippet(row.snippet);
      const existing = resultsMap.get(row.chatId);

      if (existing) {
        existing.matches.push({ type: matchType, snippet });
        if (!existing.snippet && snippet) {
          existing.snippet = snippet;
        }
        return;
      }

      resultsMap.set(row.chatId, {
        chatId: row.chatId,
        title: row.title,
        createdAt: row.createdAt,
        snippet,
        matches: [{ type: matchType, snippet }],
      });
    };

    messageMatches.forEach((row) => register(row, 'message'));
    titleMatches.forEach((row) => register(row, 'title'));

    const ordered = Array.from(resultsMap.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return ordered.slice(0, limit);
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

  async updateChatArchiveStateById(chatId: string, isArchived: boolean, session: UserSession) {
    const chat = await this.chatQueryService.getChatById({ id: chatId });

    if (!chat) {
      throw new ChatSDKError('not_found:chat');
    }

    if (chat.userId !== session.user.id) {
      throw new ChatSDKError('forbidden:chat');
    }

    return await this.chatQueryService.updateChatArchiveStateById({ id: chatId, isArchived });
  }

  private async generateChatTitleInBackground({
    chatId,
    userQueryText,
  }: {
    chatId: string;
    userQueryText: string;
  }) {
    try {
      const sanitized = this.textProcessingService.sanitizeText(userQueryText);
      if (!this.textProcessingService.isValidTextContent(sanitized)) {
        return;
      }

      const title = await this.aiResponseService.generateTitle(sanitized);
      const trimmed = title.trim();

      if (!trimmed) {
        return;
      }

      await this.chatQueryService.updateChatTitleById({ id: chatId, title: trimmed });
    } catch (error) {
      console.warn('Failed to generate chat title in background', chatId, error);
    }
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

    if (chat.userId !== session.user.id && !chat.isPublic) {
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
