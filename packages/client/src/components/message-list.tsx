'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { BotIcon } from 'lucide-react';
import { Streamdown } from 'streamdown';

import { useVotes } from '../hooks';
import type { Vote } from '../hooks';
import type { MessageDocument } from '../types/chat';
import {
  Message,
  MessageContent,
} from '@workspace/ui/components/ui/shadcn-io/ai/message';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@workspace/ui/components/ui/shadcn-io/ai/conversation';
import { useSharedChatContext } from '../providers';
import { MessageReasoning } from './message-reasoning';
import { MessageActions } from './message-actions';
import { DocumentAttachments } from './document-attachments';
import { DocumentPreview } from './document-preview';

export interface MessageListProps {
  chatId: string;
  onRegenerate?: () => void;
  enableVoting?: boolean;
  enableFork?: boolean;
  onNavigate?: (path: string) => void;
}

export function MessageList({
  chatId,
  onRegenerate,
  enableVoting = true,
  enableFork = true,
  onNavigate,
}: MessageListProps) {
  const { chat } = useSharedChatContext();
  const { messages, status } = useChat({ chat });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewDocument, setPreviewDocument] = useState<MessageDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { data: votes } = useVotes(chatId);

  const votesByMessageId = useMemo(() => {
    if (!votes) {
      return new Map<string, Vote>();
    }

    return new Map<string, Vote>(votes.map((voteItem) => [voteItem.messageId, voteItem]));
  }, [votes]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    scrollToBottom(messages.length === 1 ? 'auto' : 'smooth');
  }, [messages, scrollToBottom]);

  const isStreaming = status === 'streaming';

  const handleDocumentPreview = useCallback((document: MessageDocument) => {
    setPreviewDocument(document);
    setIsPreviewOpen(true);
  }, []);

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);

    setTimeout(() => {
      setPreviewDocument(null);
    }, 300);
  }, []);

  return (
    <div className="flex-1 overflow-hidden">
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
            messages.map((message) => {
              const alignmentClass = message.role === 'user' ? 'justify-end' : 'justify-start';
              const vote = votesByMessageId.get(message.id) ?? null;

              return (
                <div key={message.id} className="space-y-2">
                  <Message from={message.role} className="group/message py-0">
                    <MessageContent>
                      <div className="space-y-3">
                        {message.parts.map((part, index) => {
                          const partKey = `message-${message.id}-part-${index}`;

                          if (part.type === 'reasoning' && part.text?.trim()) {
                            return (
                              <MessageReasoning
                                key={partKey}
                                isLoading={isStreaming}
                                reasoning={part.text}
                              />
                            );
                          }

                          if (part.type === 'text' && part.text) {
                            return <Streamdown key={partKey}>{part.text}</Streamdown>;
                          }

                          return null;
                        })}
                      </div>

                      <DocumentAttachments message={message} onPreview={handleDocumentPreview} />
                    </MessageContent>
                  </Message>

                  <div className={`flex ${alignmentClass}`}>
                    <MessageActions
                      chatId={chatId}
                      message={message}
                      vote={vote}
                      isLoading={isStreaming}
                      status={status}
                      onRegenerate={onRegenerate}
                      className="pt-1"
                      enableVoting={enableVoting}
                      enableFork={enableFork}
                      onNavigate={onNavigate}
                    />
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <DocumentPreview
        document={previewDocument}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
    </div>
  );
}

export default MessageList;
