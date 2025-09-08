'use client';

import { v4 as uuidv4 } from 'uuid';
import { MicIcon, PaperclipIcon, BotIcon, XIcon, FileIcon, DownloadIcon } from 'lucide-react';
import { FormEventHandler, useState, useRef, useEffect, useCallback } from "react";
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
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent } from '@workspace/ui/components/card';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  file: File;
}

const models = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
] as const;

export default function Page() {
  const [chatId] = useState(() => uuidv4());
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { messages, sendMessage, status } = useChat({
    generateId: () => uuidv4(),
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id: chatId,
            messages,
            selectedChatModel: model,
            documentIds: uploadedFiles.map(file => file.id),
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = useCallback(async (files: FileList) => {
    const formData = new FormData();
    const fileArray = Array.from(files);
    
    fileArray.forEach(file => {
      formData.append('files', file);
    });
    
    formData.append('chatId', chatId);
    formData.append('extractText', 'true');

    console.log('Uploading files...', { chatId, fileCount: fileArray.length, fileNames: fileArray.map(f => f.name) });

    try {
      setIsUploading(true);
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload response error:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      const newFiles = data.files.map((file: any) => ({
        ...file,
        file: fileArray.find(f => f.name === file.fileName),
      }));

      setUploadedFiles(prev => [...prev, ...newFiles]);
    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setIsUploading(false);
    }
  }, [chatId]);

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
    event.target.value = '';
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (text.trim() || uploadedFiles.length > 0) {
      await sendMessage({ text: text.trim() });
      setText('');
      setUploadedFiles([]);
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
      
      {uploadedFiles.length > 0 && (
        <div className='p-4 border-t bg-background'>
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Attached Files</h4>
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file) => (
                <Card key={file.id} className="flex items-center gap-2 p-2 max-w-xs">
                  <CardContent className="flex items-center gap-2 p-0">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.fileSize)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(file.downloadUrl, '_blank')}
                      >
                        <DownloadIcon className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        disabled={isUploading}
                      >
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
      
      <div className='p-4 border-t bg-background'>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            onChange={(e) => setText(e.target.value)}
            value={text}
            placeholder="Type your message..."
            disabled={status !== 'ready' || isUploading}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton 
                disabled={status !== 'ready' || isUploading}
                onClick={triggerFileSelect}
              >
                <PaperclipIcon size={16} />
              </PromptInputButton>
              <PromptInputButton disabled={status !== 'ready' || isUploading}>
                <MicIcon size={16} />
                <span>Voice</span>
              </PromptInputButton>
              <PromptInputModelSelect onValueChange={setModel} value={model} disabled={status !== 'ready' || isUploading}>
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
            <PromptInputSubmit 
              disabled={(!text.trim() && uploadedFiles.length === 0) || status !== 'ready' || isUploading} 
              status={status} 
            />
          </PromptInputToolbar>
        </PromptInput>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.csv"
        />
      </div>
    </div>
  )
}
