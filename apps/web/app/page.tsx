'use client';

import { v4 as uuidv4 } from 'uuid';
import { MicIcon, PaperclipIcon, BotIcon } from 'lucide-react';
import { FormEventHandler, useState, useRef, useEffect } from "react";
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@workspace/ui/components/ui/shadcn-io/ai/prompt-input';
import { Message, MessageContent } from '@workspace/ui/components/ui/shadcn-io/ai/message';
import { Conversation, ConversationContent, ConversationScrollButton } from '@workspace/ui/components/ui/shadcn-io/ai/conversation';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const models = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
] as const;

export default function Page() {
  const { messages, sendMessage, status } = useChat({
    generateId: () => uuidv4(),
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            messages,
            selectedChatModel: model,
            ...body,
          }
        };
      },
    })
  });
  const [text, setText] = useState<string>('');
  const [model, setModel] = useState<string>(models[0]?.id || '');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (text.trim()) {
      sendMessage({ text: text.trim() });
      setText('');
    }
  };

  return (
    <div className='flex flex-col h-[calc(100vh-8rem)]'>
      <div className='flex-1 overflow-hidden'>
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <BotIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Welcome to AI Chat</h3>
                  <p className="text-sm">Start a conversation by typing a message below.</p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    <div className="whitespace-pre-wrap">
                      {message.parts.map((part, index) =>
                        part.type === 'text' ? <span key={index}>{part.text}</span> : null
                      )}
                    </div>
                  </MessageContent>
                </Message>
              ))
            )}
            <div ref={messagesEndRef} />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>
      
      <div className='p-4 border-t bg-background'>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            onChange={(e) => setText(e.target.value)}
            value={text}
            placeholder="Type your message..."
            disabled={status !== 'ready'}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton disabled={status !== 'ready'}>
                <PaperclipIcon size={16} />
              </PromptInputButton>
              <PromptInputButton disabled={status !== 'ready'}>
                <MicIcon size={16} />
                <span>Voice</span>
              </PromptInputButton>
              <PromptInputModelSelect onValueChange={setModel} value={model} disabled={status !== 'ready'}>
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem key={model.id} value={model.id}>
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={!text.trim() || status !== 'ready'} status={status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  )
}
