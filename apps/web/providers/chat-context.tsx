'use client';

import React, { createContext, useContext, ReactNode, useRef, useState } from 'react';
import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage } from 'ai';
import { v4 as uuidv4 } from "uuid";

import { resolveApiUrl } from '@/lib/http';

interface ChatContextValue {
  chat: Chat<UIMessage>;
  clearChat: () => void;
  setChatContext: (ctx: { chatId?: string; selectedModel?: string; reasoningEnabled?: boolean; assistantId?: string }) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const chatIdRef = useRef<string | undefined>(undefined);
  const selectedModelRef = useRef<string | undefined>(undefined);
  const reasoningEnabledRef = useRef<boolean>(false);
  const assistantIdRef = useRef<string | undefined>(undefined);

  const createChat = () => new Chat<UIMessage>({
    generateId: () => uuidv4(),
    transport: new DefaultChatTransport({
      api: resolveApiUrl('/api/chat'),
      credentials: 'include',
      prepareSendMessagesRequest: ({ messages }) => {
        const lastMessage = messages[messages.length - 1];
        return {
          body: {
            id: chatIdRef.current,
            selectedChatModel: selectedModelRef.current,
            message: lastMessage,
            enableReasoning: reasoningEnabledRef.current,
            assistantId: assistantIdRef.current,
          },
        };
      },
    }),
  });

  const [chat, setChat] = useState(() => createChat());

  const clearChat = () => {
    setChat(createChat());
  };

  const setChatContext = (ctx: { chatId?: string; selectedModel?: string; reasoningEnabled?: boolean; assistantId?: string }) => {
    if (ctx.chatId !== undefined) chatIdRef.current = ctx.chatId;
    if (ctx.selectedModel !== undefined) selectedModelRef.current = ctx.selectedModel;
    if (ctx.reasoningEnabled !== undefined) reasoningEnabledRef.current = ctx.reasoningEnabled;
    if (ctx.assistantId !== undefined) assistantIdRef.current = ctx.assistantId;
  };

  return (
    <ChatContext.Provider
      value={{
        chat,
        clearChat,
        setChatContext,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useSharedChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useSharedChatContext must be used within a ChatProvider');
  }
  return context;
}
