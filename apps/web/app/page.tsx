"use client";

import { v4 as uuidv4 } from "uuid";
import {
  FormEventHandler,
  useState,
  useCallback,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import ErrorBoundary from "../components/error-boundary";
import ChatHeader from "../components/chat-header";
import MessageList from "../components/message-list";
import ChatInput from "../components/chat-input";
import ConversationHistory from "../components/conversation-history";
import { SUPPORTED_MODELS, DEFAULT_LLM_MODEL } from "../lib/models";

interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  file: File;
}

export default function Page() {
  const [chatId] = useState(() => uuidv4());
  const [text, setText] = useState<string>("");
  const [model, setModel] = useState<string>(DEFAULT_LLM_MODEL!.id);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const { messages, sendMessage, status } = useChat({
    generateId: () => uuidv4(),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages, body }) {
        return {
          body: {
            id: chatId,
            messages,
            selectedChatModel: model,
            ...body,
          },
        };
      },
    }),
  });

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

    if (text.trim() || uploadedFiles.length > 0) {
      setText("");
      setUploadedFiles([]);
      await sendMessage({ text: text.trim() });
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <ChatHeader title="AI Chat">
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
