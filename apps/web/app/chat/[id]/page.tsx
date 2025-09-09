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
import { DefaultChatTransport } from "ai";
import { useRouter, useParams } from "next/navigation";

import ErrorBoundary from "../../../components/error-boundary";
import ChatHeader from "../../../components/chat-header";
import MessageList from "../../../components/message-list";
import ChatInput from "../../../components/chat-input";
import ConversationHistory from "../../../components/conversation-history";
import { SUPPORTED_MODELS, DEFAULT_LLM_MODEL } from "../../../lib/models";
import { Button } from "@workspace/ui/components/button";

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  file: File;
}

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const chatId = params.id as string;
  
  const [text, setText] = useState<string>("");
  const [model, setModel] = useState<string>(DEFAULT_LLM_MODEL!.id);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    generateId: () => uuidv4(),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages, body }) {
        const lastMessage = messages[messages.length - 1];
          return {
            body: {
              id: chatId,
              selectedChatModel: model,
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
        setIsLoading(true);
        setError(null);

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

        const data = await messagesResponse.json();
        
        const transformedMessages = data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          parts: msg.parts || [{ type: "text", text: msg.content || "" }],
          createdAt: new Date(msg.createdAt),
        }));

        setMessages(transformedMessages);
      } catch (err) {
        console.error("Error loading chat:", err);
        setError(err instanceof Error ? err.message : "Failed to load chat");
      } finally {
        setIsLoading(false);
      }
    };

    if (chatId) {
      loadChat();
    }
  }, [chatId, router, setMessages]);

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
    },
    [chatId],
  );

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const handleChatSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (text.trim() || uploadedFiles.length > 0) {
      await sendMessage({ text: text.trim(), files: uploadedFiles.map((file) => ({
          type: 'file',
          mediaType: file.mimeType,
          url: file.downloadUrl,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

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
        />

        <ChatInput
          models={SUPPORTED_MODELS}
          text={text}
          setText={setText}
          model={model}
          setModel={setModel}
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
