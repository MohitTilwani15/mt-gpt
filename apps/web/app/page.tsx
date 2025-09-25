"use client";

import { v4 as uuidv4 } from "uuid";
import {
  FormEventHandler,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import { UIMessage, FileUIPart } from "ai";

import { ErrorBoundary, ChatInput } from "@workspace/client/components";
import { useAssistants, useSelectedModel, createChat, useFileUpload } from "@workspace/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  file: File;
}

export default function Page() {
  const router = useRouter();
  const [text, setText] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [chatId] = useState<string>(() => uuidv4());
  const { isUploading: isFileUploading, uploadFiles } = useFileUpload();
  const { data: assistants = [] } = useAssistants();
  
  const {
    selectedModel,
    setSelectedModel,
    availableModels: supportedModels,
    isLoading: isLoadingModels
  } = useSelectedModel();

  const [selectedAssistantId, setSelectedAssistantId] = useState<string>("");

  useEffect(() => {
    if (!selectedAssistantId) {
      return;
    }

    const assistant = assistants.find((item) => item.id === selectedAssistantId);
    if (assistant?.defaultModel) {
      setSelectedModel(assistant.defaultModel);
    }
  }, [selectedAssistantId, assistants, setSelectedModel]);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      try {
        const data = await uploadFiles(files, {
          chatId,
          extractText: true,
        });
        const newFiles = data.files.map((file: any) => ({
          ...file,
          file: Array.from(files).find((f) => f.name === file.fileName),
        }));

        setUploadedFiles((prev) => [...prev, ...newFiles]);
      } catch (error) {
        console.error("Error uploading files:", error);
      }
    }, [uploadFiles, chatId],
  );

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const handleChatSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (isLoadingModels) return;

    if (!selectedModel && supportedModels.length > 0) return;

    if (text.trim() || uploadedFiles.length > 0) {
      const files: FileUIPart[] = uploadedFiles.map((file) => ({
        type: 'file',
        mediaType: file.mimeType,
        url: file.downloadUrl,
        providerMetadata: {
          file: {
            id: file.id
          }
        }
      }))
      
      const initialMessage: UIMessage = {
        id: uuidv4(),
        role: 'user',
        parts: [
          {
            type: 'text',
            text: text.trim()
          },
          ...files
        ]
      };
      
      try {
        await createChat({
          id: chatId,
          assistantId: selectedAssistantId || undefined,
        });
        
        sessionStorage.setItem(
          `chat-${chatId}`,
          JSON.stringify({
            message: initialMessage,
            assistantId: selectedAssistantId || null,
          }),
        );
        
        setText("");
        setUploadedFiles([]);
        
        router.push(`/chat/${chatId}`);
      } catch (error) {
        console.error('Error creating chat:', error);
      }
    }
  };
  
  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full">        
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-4">Welcome to AI Chat</h1>
              <p className="text-lg text-muted-foreground">
                Start a conversation by typing a message below
              </p>
            </div>

            <div className="mb-6 space-y-2 text-left">
              <Label className="text-sm font-medium text-foreground">Assistant</Label>
              <Select
                value={selectedAssistantId || 'none'}
                onValueChange={(value) => setSelectedAssistantId(value === 'none' ? '' : value)}
              >
                <SelectTrigger className="w-full justify-between">
                  <SelectValue placeholder="No assistant" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="none">No assistant</SelectItem>
                  {assistants.map((assistant) => (
                    <SelectItem key={assistant.id} value={assistant.id}>
                      {assistant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAssistantId ? (
                <p className="text-xs text-muted-foreground">
                  Using assistant {assistants.find((a) => a.id === selectedAssistantId)?.name ?? selectedAssistantId}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Messages will use the default assistant settings.</p>
              )}
            </div>
            
            <div className="relative">
              <ChatInput
                models={supportedModels}
                text={text}
                setText={setText}
                model={selectedModel}
                setModel={setSelectedModel}
                isFileUploading={isFileUploading}
                uploadedFiles={uploadedFiles}
                onFileUpload={handleFileUpload}
                onRemoveFile={removeFile}
                onSubmit={handleChatSubmit}
                className="mx-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
