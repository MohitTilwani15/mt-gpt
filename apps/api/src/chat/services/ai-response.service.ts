import { Injectable } from '@nestjs/common';
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
import { v4 as uuidv4 } from 'uuid';

import { LinkUpSoWebSearchToolService } from '../../lib/tools/linkup-so-web-search.tool';
import { CloudflareAIGatewayService } from '../../services/cloudflare-ai-gateway.service';
import { McpToolService } from './mcp-tool.service';
import { ChatModel, CHAT_MODEL_SUPPORTS_REASONING } from '../dto/chat.dto';
import type { AssistantCapabilities } from '../../database/schemas/assistant.schema';

export interface AIResponseRequest {
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
}

export interface AIResponseCallbacks {
  onFinish?: (data: { responseMessage: UIMessage; isAborted: boolean }) => Promise<void>;
  onError?: (error: Error) => string;
}

@Injectable()
export class AIResponseService {
  constructor(
    private readonly linkupsoWebSearchToolService: LinkUpSoWebSearchToolService,
    private readonly cloudflareAIGatewayService: CloudflareAIGatewayService,
    private readonly mcpToolService: McpToolService,
  ) {}

  async generateResponse(
    request: AIResponseRequest,
    callbacks: AIResponseCallbacks = {}
  ) {
    let finalUsage: LanguageModelUsage | undefined;

    const reasoningAllowed = Boolean(request.enableReasoning) &&
      CHAT_MODEL_SUPPORTS_REASONING[request.selectedChatModel];

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const systemPromptParts = [this.getSystemPrompt()];

        if (request.assistantContext?.instructions) {
          systemPromptParts.push(
            `You are acting as the specialised assistant \"${request.assistantContext.name ?? 'Custom Assistant'}\". ` +
            `Follow these instructions carefully:\\n${request.assistantContext.instructions.trim()}`,
          );
        }

        const combinedAdditionalContext = [
          request.additionalSystemContext,
          request.assistantContext?.knowledgeSnippet,
        ]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join('\\n\\n');

        if (combinedAdditionalContext) {
          systemPromptParts.push(`Additional helpful context:\\n${combinedAdditionalContext}`);
        }

        const systemPrompt = systemPromptParts.join('\\n\\n');

        const enableWebSearch = request.assistantContext?.capabilities
          ? request.assistantContext.capabilities.webSearch !== false
          : true;

        const mcpTools = await this.mcpToolService.getTools();
        const tools: Record<string, any> = { ...mcpTools };

        if (enableWebSearch && !tools.webSearch) {
          tools.webSearch = this.linkupsoWebSearchToolService.askLinkupTool();
        }

        const hasTools = Object.keys(tools).length > 0;

        const result = streamText({
          model: this.cloudflareAIGatewayService.aigateway([openai(request.selectedChatModel || 'gpt-4o')]),
          system: systemPrompt,
          messages: convertToModelMessages(request.messages),
          stopWhen: stepCountIs(5),
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'chat',
            metadata: {
              userId: request.userId,
              chatId: request.chatId,
              model: request.selectedChatModel,
              assistantId: request.assistantContext?.assistantId,
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
          abortSignal: request.abortSignal,
        });

        result.consumeStream();

        dataStream.merge(result.toUIMessageStream({ 
          sendReasoning: reasoningAllowed, 
          sendSources: true 
        }));
      },
      generateId: uuidv4,
      onFinish: async ({ responseMessage, isAborted }) => {
        if (callbacks.onFinish) {
          await callbacks.onFinish({ responseMessage, isAborted });
        }
      },
      onError: (error: Error) => {
        console.error('Error while streaming response:', error);
        if (callbacks.onError) {
          return callbacks.onError(error);
        }
        return 'Oops, an error occurred!';
      },
    });

    (stream as any).getUsage = () => finalUsage;

    return stream;
  }

  async generateTitle(message: string): Promise<string> {
    const { text: title } = await generateText({
      model: openai('gpt-4o'),
      system: `
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
}
