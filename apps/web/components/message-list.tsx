'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BotIcon } from 'lucide-react';
import { UIMessage } from 'ai';

import {
  Message,
  MessageContent,
} from '@workspace/ui/components/ui/shadcn-io/ai/message';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@workspace/ui/components/ui/shadcn-io/ai/conversation';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger
} from '@workspace/ui/components/ui/shadcn-io/ai/reasoning'
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
}

export default function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewDocument, setPreviewDocument] = useState<MessageDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  <div>
                    {message.parts.map((part, index) => {
                      if (part.type === "reasoning") {
                        return (
                          <div key={index} className="mb-4">
                            <Reasoning>
                              <div className="prose prose-sm max-w-none">
                                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                                  {part.text}
                                </pre>
                              </div>
                            </Reasoning>
                          </div>
                        );
                      }
                      if (part.type === "text") {
                        return (
                          <div key={index}>
                            <MarkdownRenderer content={part.text} />
                          </div>
                        );
                      }
                      return null;
                    })}
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