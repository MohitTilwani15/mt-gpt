"use client";

import { v4 as uuidv4 } from "uuid";
import {
  FormEventHandler,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useRouter } from "next/navigation";

import ErrorBoundary from "@/components/error-boundary";
import ChatHeader from "@/components/chat-header";
import ChatInput from "@/components/chat-input";
import ConversationHistory from "@/components/conversation-history";
import { useSupportedModels } from "@/lib/use-models";
import { UIMessage, FileUIPart } from "ai";

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
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [chatId] = useState<string>(() => uuidv4());
  
  const { data: modelsData, error: modelsError } = useSupportedModels();
  const supportedModels = modelsData?.models || [];
  const [selectedModel, setSelectedModel] = useState<string>(modelsData?.defaultModel || "");

  useEffect(() => {
    if (modelsData?.defaultModel && !selectedModel) {
      setSelectedModel(modelsData.defaultModel);
    }
  }, [modelsData, selectedModel]);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const formData = new FormData();
      const fileArray = Array.from(files);

      fileArray.forEach((file) => {
        formData.append("files", file);
      });

      formData.append("chatId", chatId);
      formData.append("extractText", "true");

      try {
        setIsFileUploading(true);

        const response = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const newFiles = data.files.map((file: any) => ({
          ...file,
          file: fileArray.find((f) => f.name === file.fileName),
        }));

        setUploadedFiles((prev) => [...prev, ...newFiles]);
      } catch (error) {
        console.error("Error uploading files:", error);
      } finally {
        setIsFileUploading(false);
      }
    }, [chatId],
  );

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const handleChatSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (modelsError) return;

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
        const createChatResponse = await fetch('/api/chat/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            id: chatId
          }),
        });

        if (!createChatResponse.ok) {
          throw new Error('Failed to create chat');
        }
        
        sessionStorage.setItem(`chat-${chatId}`, JSON.stringify(initialMessage));
        
        setText("");
        setUploadedFiles([]);
        
        router.push(`/chat/${chatId}`);
      } catch (error) {
        console.error('Error creating chat:', error);
      }
    }
  };

  if (modelsError) {
    return (
      <ErrorBoundary>
        <div className="flex flex-col h-screen">
          <ChatHeader title="AI Chat">
            <ConversationHistory />
          </ChatHeader>
          
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center max-w-md">
              <h2 className="text-xl font-semibold mb-2">Error</h2>
              <p className="text-muted-foreground mb-4">Failed to load available models. Please refresh the page.</p>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen">
        <ChatHeader title="AI Chat">
          <ConversationHistory />
        </ChatHeader>
        
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-4">Welcome to AI Chat</h1>
              <p className="text-lg text-muted-foreground">
                Start a conversation by typing a message below
              </p>
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
                status="ready"
                className="mx-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
