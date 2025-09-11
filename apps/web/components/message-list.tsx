'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BotIcon } from 'lucide-react';
import { ChatStatus, UIMessage } from 'ai';
import { useVotes, getVoteForMessage } from '@/hooks/use-votes';

import {
  Message,
  MessageContent,
} from '@workspace/ui/components/ui/shadcn-io/ai/message';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@workspace/ui/components/ui/shadcn-io/ai/conversation';
import { MessageReasoning } from './message-reasoning';
import { MessageActions } from './message-actions';
import MarkdownRenderer from './markdown-renderer';
import DocumentAttachments from './document-attachments';
import DocumentPreview from './document-preview';

interface MessageDocument {
  id: string;
  fileName?: string;
  fileSize?: number;
  mimeType: string;
  text?: string;
  downloadUrl: string;
  createdAt?: string;
}

interface MessageListProps {
  messages: UIMessage[];
  status: ChatStatus;
  chatId: string;
  onRegenerate?: () => void;
}


export default function MessageList({ messages, status, chatId, onRegenerate }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewDocument, setPreviewDocument] = useState<MessageDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { data: votes } = useVotes(chatId);

  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
            messages.map((message) => (
              <Message key={message.id} from={message.role} className="group/message">
                <MessageContent>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {message.parts.map((part, index) => {
                      const { type } = part;
                      const key = `message-${message.id}-part-${index}`;

                      if (type === "reasoning" && part.text?.trim().length > 0) {
                        return (
                          <MessageReasoning
                            key={key}
                            isLoading={status === 'streaming'}
                            reasoning={part.text}
                          />
                        );
                      }
                      if (type === "text") {
                        return (
                          <div key={index}>
                            <MarkdownRenderer content={part.text} />
                          </div>
                        );
                      }
                      return null;
                    })}
                    </div>
                    
                    <div className="flex-shrink-0 ml-2">
                      <MessageActions
                        chatId={chatId}
                        message={message}
                        vote={getVoteForMessage(votes, message.id)}
                        isLoading={status === 'streaming'}
                        status={status}
                        onRegenerate={onRegenerate}
                      />
                    </div>
                  </div>

                  <DocumentAttachments
                    message={message}
                    onPreview={handleDocumentPreview}
                  />
                </MessageContent>
              </Message>
            )
          ))}
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