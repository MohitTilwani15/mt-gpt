'use client';

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
import { Message, MessageContent, MessageAvatar } from '@workspace/ui/components/ui/shadcn-io/ai/message';
import { Conversation, ConversationContent, ConversationScrollButton } from '@workspace/ui/components/ui/shadcn-io/ai/conversation';
import { MicIcon, PaperclipIcon, UserIcon, BotIcon } from 'lucide-react';
import { FormEventHandler, useState, useRef, useEffect } from "react";

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
];

export default function Page() {
  const [text, setText] = useState<string>('');
  const [model, setModel] = useState<string>(models[0]?.id || '');
  const [status, setStatus] = useState<
    'submitted' | 'streaming' | 'ready' | 'error'
  >('ready');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setStatus('submitted');
    setIsStreaming(true);

    try {
      const response = await fetch('/api/text-stream-example', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: text,
          model: model,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Update the assistant message content
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: buffer }
            : msg
        ));
      }

      setStatus('ready');
      setIsStreaming(false);
      setText('');

    } catch (error) {
      console.error('Error:', error);
      setStatus('error');
      setIsStreaming(false);
      
      // Add error message
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
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
                  <MessageAvatar
                    src={message.role === 'user' ? '' : ''}
                    name={message.role === 'user' ? 'You' : 'AI'}
                    className={message.role === 'user' ? 'bg-primary' : 'bg-secondary'}
                  >
                    {message.role === 'user' ? (
                      <UserIcon className="h-4 w-4 text-primary-foreground" />
                    ) : (
                      <BotIcon className="h-4 w-4 text-secondary-foreground" />
                    )}
                  </MessageAvatar>
                  <MessageContent>
                    <div className="whitespace-pre-wrap">{message.content}</div>
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
            disabled={isStreaming}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton disabled={isStreaming}>
                <PaperclipIcon size={16} />
              </PromptInputButton>
              <PromptInputButton disabled={isStreaming}>
                <MicIcon size={16} />
                <span>Voice</span>
              </PromptInputButton>
              <PromptInputModelSelect onValueChange={setModel} value={model} disabled={isStreaming}>
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
            <PromptInputSubmit disabled={!text.trim() || isStreaming} status={isStreaming ? 'streaming' : status} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  )
}
