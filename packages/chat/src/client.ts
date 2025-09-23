import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { v4 as uuidv4 } from "uuid";

import { getApiBaseUrl, resolveApiUrl } from "@workspace/api";

export interface ChatContextSnapshot {
  chatId?: string;
  selectedModel?: string;
  assistantId?: string;
  enableReasoning?: boolean;
}

export interface CreateChatClientOptions {
  apiPath?: string;
  baseUrl?: string;
  credentials?: RequestCredentials;
  generateId?: () => string;
  getContext?: () => ChatContextSnapshot;
}

const resolveEndpoint = (path: string, baseUrl?: string) => {
  const effectiveBase = baseUrl ?? getApiBaseUrl();
  return resolveApiUrl(path, effectiveBase);
};

export const createChatClient = ({
  apiPath = "/api/chat",
  baseUrl,
  credentials = "include",
  generateId = uuidv4,
  getContext = () => ({}),
}: CreateChatClientOptions = {}) => {
  const endpoint = resolveEndpoint(apiPath, baseUrl);

  return new Chat<UIMessage>({
    generateId,
    transport: new DefaultChatTransport({
      api: endpoint,
      credentials,
      prepareSendMessagesRequest: ({ messages }) => {
        const context = getContext();
        const lastMessage = messages[messages.length - 1];

        return {
          body: {
            id: context.chatId,
            selectedChatModel: context.selectedModel,
            assistantId: context.assistantId,
            enableReasoning: context.enableReasoning,
            message: lastMessage,
          },
        };
      },
    }),
  });
};
