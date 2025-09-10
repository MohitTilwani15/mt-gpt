'use client';

import { useEffect, useRef } from 'react';
import { BotIcon, FileIcon } from 'lucide-react';
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
import MarkdownRenderer from './markdown-renderer';
import DocumentAttachments from './document-attachments';
import { formatFileSize } from '../lib/utils';

interface MessageDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  text?: string;
  downloadUrl: string;
  createdAt: string;
}

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  file: File | null;
}

interface MessageListProps {
  messages: UIMessage[];
  onDocumentPreview?: (document: MessageDocument) => void;
}

export default function MessageList({
  messages,
  onDocumentPreview,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
                    {message.parts.map((part, index) =>
                      part.type === "text" ? (
                        <div key={index}>
                          <MarkdownRenderer content={part.text} />
                        </div>
                      ) : null,
                    )}
                  </div>

                  <DocumentAttachments
                    documents={messageDocuments[message.id] || []}
                    onPreview={onDocumentPreview || (() => {})}
                  />
                </MessageContent>
              </Message>
            )
          ))}
          <div ref={messagesEndRef} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}