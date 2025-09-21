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
  CHAT_MODEL_SUPPORTS_REASONING,
} from './dto/chat.dto';
import { ChatResponse } from './interfaces/chat.interface';
import { DATABASE_CONNECTION } from 'src/database/database-connection';
import { databaseSchema } from 'src/database/schemas';
import { mapDBPartToUIMessagePart } from '../lib/message-mapping';
import { LinkUpSoWebSearchToolService } from '../lib/tools/linkup-so-web-search.tool'
import { Mem0MemoryService } from './services/mem0-memory.service';
import { CloudflareAIGatewayService } from 'src/services/cloudflare-ai-gateway.service';
import { McpToolService } from './services/mcp-tool.service';
import { AssistantQueryService } from 'src/database/queries/assistant.query';
import { AssistantKnowledgeQueryService } from 'src/database/queries/assistant-knowledge.query';
import type { AssistantCapabilities } from 'src/database/schemas/assistant.schema';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatQueryService: ChatQueryService,
    private readonly messageQueryService: MessageQueryService,
    private readonly voteQueryService: VoteQueryService,
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
    private readonly linkupsoWebSearchToolService: LinkUpSoWebSearchToolService,
    private readonly mem0MemoryService: Mem0MemoryService,
    private readonly cloudflareAIGatewayService: CloudflareAIGatewayService,
    private readonly assistantQueryService: AssistantQueryService,
    private readonly assistantKnowledgeQueryService: AssistantKnowledgeQueryService,
    private readonly mcpToolService: McpToolService,
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
      const knowledgeSnippets = knowledgeRecords
        .filter((record) => record.text && record.text.trim())
        .slice(0, 5)
        .map((record) => {
          const truncated = record.text!.trim().slice(0, 1600);
          return `- ${record.fileName}: ${truncated}`;
        });

      assistantContext = {
        instructions: assistant.instructions ?? null,
        knowledgeSnippet: knowledgeSnippets.length
          ? `Long-term assistant knowledge:\n${knowledgeSnippets.join('\n')}`
          : null,
        capabilities: assistant.capabilities ?? {},
        assistantId: assistant.id,
        name: assistant.name,
      };
    }

    const userQueryText = this.extractTextFromParts(message.parts || []);
    const shouldGenerateTitle = Boolean(
      existingChat && existingChat.title === 'New Chat' && userQueryText.trim(),
    );

    const stream = await this.db.transaction(async (transaction) => {
      await this.messageQueryService.upsertMessage({ messageId: message.id, chatId: id, message });

      const dbMessages = await transaction.query.message.findMany({
        where: eq(databaseSchema.message.chatId, id),
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

      let memoryContext = '';
      try {
        memoryContext = await this.mem0MemoryService.getMemoryContext(
          session.user.id,
          userQueryText,
          5,
        );
      } catch (err) {
        console.warn('Memory retrieval failed', err);
      }

      return this.generateAIResponse({
        chatId: id,
        messages,
        selectedChatModel: effectiveModel,
        message,
        abortSignal,
        userId: session.user.id,
        additionalSystemContext: memoryContext,
        enableReasoning: Boolean(enableReasoning),
        assistantContext,
      });
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

  private async generateAIResponse({
    chatId,
    messages,
    selectedChatModel,
    message,
    abortSignal,
    userId,
    additionalSystemContext,
    enableReasoning,
    assistantContext,
  }: {
    chatId: string;
    messages: UIMessage[];
    selectedChatModel: ChatModel;
    message: UIMessage;
    abortSignal?: AbortSignal;
    userId: string;
    additionalSystemContext?: string;
    enableReasoning?: boolean;
    assistantContext?: {
      instructions?: string | null;
      knowledgeSnippet?: string | null;
      capabilities?: AssistantCapabilities | null;
      assistantId?: string;
      name?: string;
    };
  }) {
    let finalUsage: LanguageModelUsage | undefined;

    const reasoningAllowed = Boolean(enableReasoning) &&
      CHAT_MODEL_SUPPORTS_REASONING[selectedChatModel];

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

        const systemPromptParts = [this.getSystemPrompt()];

        if (assistantContext?.instructions) {
          systemPromptParts.push(
            `You are acting as the specialised assistant "${assistantContext.name ?? 'Custom Assistant'}". ` +
            `Follow these instructions carefully:\n${assistantContext.instructions.trim()}`,
          );
        }

        const combinedAdditionalContext = [
          additionalSystemContext,
          assistantContext?.knowledgeSnippet,
        ]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join('\n\n');

        if (combinedAdditionalContext) {
          systemPromptParts.push(`Additional helpful context:\n${combinedAdditionalContext}`);
        }

        const systemPrompt = systemPromptParts.join('\n\n');

        const enableWebSearch = assistantContext?.capabilities
          ? assistantContext.capabilities.webSearch !== false
          : true;

        const mcpTools = await this.mcpToolService.getTools();
        const tools: Record<string, any> = { ...mcpTools };

        if (enableWebSearch && !tools.webSearch) {
          tools.webSearch = this.linkupsoWebSearchToolService.askLinkupTool();
        }

        const hasTools = Object.keys(tools).length > 0;

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
              assistantId: assistantContext?.assistantId,
            },
          },
          ...(hasTools ? { tools } : {}),
          ...(reasoningAllowed ? { reasoning: { effort: 'medium' } } : {}),
          providerOptions: reasoningAllowed
            ? {
                openai: {
                  reasoningEffort: 'high',
                  reasoningSummary: 'detailed',
                },
                xai: {
                  reasoningEffort: 'high',
                },
              }
            : undefined,
          onFinish: ({ usage }) => {
            finalUsage = usage
          },
          abortSignal,
        });

        result.consumeStream();

        dataStream.merge(result.toUIMessageStream({ sendReasoning: reasoningAllowed, sendSources: true }));
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

  private async generateChatTitleInBackground({
    chatId,
    userQueryText,
  }: {
    chatId: string;
    userQueryText: string;
  }) {
    try {
      const title = await this.generateTitleFromUserMessage(userQueryText);
      const trimmed = title.trim();

      if (!trimmed) {
        return;
      }

      await this.chatQueryService.updateChatTitleById({ id: chatId, title: trimmed });
    } catch (error) {
      console.warn('Failed to generate chat title in background', chatId, error);
    }
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
