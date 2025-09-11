"use client";

import { v4 as uuidv4 } from "uuid";
import {
  FormEventHandler,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { useRouter, useParams } from "next/navigation";

import ErrorBoundary from "@/components/error-boundary";
import ChatHeader from "@/components/chat-header";
import MessageList from "@/components/message-list";
import ChatInput from "@/components/chat-input";
import ConversationHistory from "@/components/conversation-history";
import { useSelectedModel, useFileUpload } from "@/hooks/index";
import { Button } from "@workspace/ui/components/button";

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const chatId = params.id;
  
  const [text, setText] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { isUploading: isFileUploading, uploadFiles, clearError: clearFileUploadError } = useFileUpload();
  
  const {
    selectedModel,
    setSelectedModel,
    availableModels: supportedModels,
    isLoading: isLoadingModels
  } = useSelectedModel();

  const selectedModelRef = useRef<string>(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    generateId: () => uuidv4(),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages }) {
        const lastMessage = messages[messages.length - 1];
          return {
            body: {
              id: chatId,
              selectedChatModel: selectedModelRef.current,
              message: lastMessage,
            },
          };
      },
    }),
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  
  useEffect(() => {
    const loadChat = async () => {
      try {
        if (isLoadingModels) return;

        setError(null);

        const initialMessageData = sessionStorage.getItem(`chat-${chatId}`);
        
        if (initialMessageData) {
          const initialMessage: UIMessage = JSON.parse(initialMessageData);
          sessionStorage.removeItem(`chat-${chatId}`);
          await sendMessage(initialMessage)
        } else {
          const messagesResponse = await fetch(`/api/chat/${chatId}/messages?limit=100`, {
            credentials: "include",
          });

          if (!messagesResponse.ok) {
            if (messagesResponse.status === 404) {
              router.push("/");
              return;
            }
            throw new Error("Failed to load chat");
          }

          const { messages }: { messages: UIMessage[] } = await messagesResponse.json();

          setMessages(messages);
        }
      } catch (err) {
        console.error("Error loading chat:", err);
        setError(err instanceof Error ? err.message : "Failed to load chat");
      }
    };

    if (chatId) {
      loadChat();
    }
  }, [isLoadingModels]);

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
    },
    [uploadFiles, chatId],
  );

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const handleChatSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (!selectedModel && supportedModels.length > 0) {
      setError('Please select a model before sending a message.');
      return;
    }

    if (text.trim() || uploadedFiles.length > 0) {
      await sendMessage({
        text: text.trim(),
        files: uploadedFiles.map((file) => ({
          type: 'file',
          mediaType: file.mimeType,
          url: file.downloadUrl,
          filename: file.fileName,
          providerMetadata: {
            file: {
              id: file.id
            }
          }
        }))
      });
      setText("");
      setUploadedFiles([]);
    }
  };

  const handleBack = () => {
    router.push("/");
  };

  const handleRegenerate = async () => {
    if (messages.length === 0) return;
    
    const lastUserMessage = messages
      .filter(msg => msg.role === 'user')
      .pop();
    
    if (!lastUserMessage) return;
    
    const newMessages = messages.slice(0, -1);
    setMessages(newMessages);
    
    await sendMessage(lastUserMessage);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={handleBack}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <ChatHeader title="Chat" showBackButton={true} onBack={handleBack}>
          <ConversationHistory />
        </ChatHeader>
        
        <MessageList
          messages={messages}
          status={status}
          chatId={chatId}
          onRegenerate={handleRegenerate}
        />

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
          status={status}
        />
      </div>
    </ErrorBoundary>
  );
}
