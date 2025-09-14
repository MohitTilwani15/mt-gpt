'use client';

import { useRef, FormEventHandler } from 'react';
import { PaperclipIcon } from 'lucide-react';

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

import { SUPPORTED_FILE_TYPES } from '@/lib/utils';
import type { ChatModel } from '@/hooks/use-models';
import { StopButton } from "@/components/stop-button";
import TextInputAttachments from './text-input-attachments';
import { useChat } from '@ai-sdk/react';
import { useSharedChatContext } from '@/providers/chat-context';

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
}

interface ChatInputProps {
  text: string;
  setText: (text: string) => void;
  model: string;
  setModel: (model: string) => void;
  models: readonly ChatModel[];
  uploadedFiles: UploadedFile[];
  onFileUpload: (files: FileList) => Promise<void>;
  onRemoveFile: (fileId: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  isFileUploading: boolean;
  className?: string;
}

export default function ChatInput({
  text,
  setText,
  model,
  setModel,
  models,
  uploadedFiles,
  onFileUpload,
  onRemoveFile,
  onSubmit,
  isFileUploading,
  className,
}: ChatInputProps) {
  const { chat } = useSharedChatContext();
  const { status, setMessages, stop } = useChat({ chat });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onFileUpload(files);
    }
    event.target.value = '';
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`p-4 bg-background ${className || ''}`}>
      <PromptInput onSubmit={onSubmit}>
        <TextInputAttachments
          files={uploadedFiles}
          onRemoveFile={onRemoveFile}
        />
        <PromptInputTextarea
          onChange={(e) => setText(e.target.value)}
          value={text}
          placeholder="Type your message..."
          disabled={status !== 'ready' || isFileUploading}
        />
        <PromptInputToolbar>
          <PromptInputTools>
            <PromptInputButton
              disabled={status !== 'ready' || isFileUploading}
              onClick={triggerFileSelect}
            >
              <PaperclipIcon size={16} />
            </PromptInputButton>
            <PromptInputModelSelect
              onValueChange={setModel}
              value={model}
              disabled={status !== 'ready' || isFileUploading}
            >
              <PromptInputModelSelectTrigger>
                <PromptInputModelSelectValue />
              </PromptInputModelSelectTrigger>
              <PromptInputModelSelectContent>
                {models.map((model) => (
                  <PromptInputModelSelectItem
                    key={model.id}
                    value={model.id}
                  >
                    {model.name}
                  </PromptInputModelSelectItem>
                ))}
              </PromptInputModelSelectContent>
            </PromptInputModelSelect>
          </PromptInputTools>
          {status === 'streaming' && stop && setMessages ? (
            <StopButton stop={stop} setMessages={setMessages} />
          ) : (
            <PromptInputSubmit
              status={status}
              disabled={
                (!text.trim() && uploadedFiles.length === 0) ||
                isFileUploading
              }
            />
          )}
          
        </PromptInputToolbar>
      </PromptInput>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept={SUPPORTED_FILE_TYPES.join(',')}
      />
    </div>
  );
}
