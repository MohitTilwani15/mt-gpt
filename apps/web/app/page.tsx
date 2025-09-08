"use client";

import { v4 as uuidv4 } from "uuid";
import { MicIcon, PaperclipIcon, BotIcon } from "lucide-react";
import {
  FormEventHandler,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import dynamic from "next/dynamic";

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
} from "@workspace/ui/components/ui/shadcn-io/ai/prompt-input";
import {
  Message,
  MessageContent,
} from "@workspace/ui/components/ui/shadcn-io/ai/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@workspace/ui/components/ui/shadcn-io/ai/conversation";

const PDFPreviewModal = dynamic(
  () => import("../components/pdf-preview-modal"),
  {
    loading: () => <div>Loading preview...</div>,
  },
);
const DocumentAttachments = dynamic(
  () => import("../components/document-attachments"),
  {
    loading: () => <div>Loading attachments...</div>,
  },
);
const TextInputAttachments = dynamic(
  () => import("../components/text-input-attachments"),
  {
    loading: () => <div>Loading attachments...</div>,
  },
);

import { SUPPORTED_FILE_TYPES } from "../lib/utils";
import ErrorBoundary from "../components/error-boundary";

interface Message {
  id: string;
  role: "user" | "assistant";
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

interface MessageDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  text?: string;
  downloadUrl: string;
  createdAt: string;
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
  const [messageDocuments, setMessageDocuments] = useState<
    Record<string, MessageDocument[]>
  >({});
  const [previewDocument, setPreviewDocument] =
    useState<MessageDocument | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            documentIds: uploadedFiles.map((file) => file.id),
            ...body,
          },
        };
      },
    }),
  });
  const [text, setText] = useState<string>("");
  const [model, setModel] = useState<string>(models[0]?.id || "");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      const formData = new FormData();
      const fileArray = Array.from(files);

      fileArray.forEach((file) => {
        formData.append("files", file);
      });

      formData.append("chatId", chatId);
      formData.append("extractText", "true");

      console.log("Uploading files...", {
        chatId,
        fileCount: fileArray.length,
        fileNames: fileArray.map((f) => f.name),
      });

      try {
        setIsUploading(true);
        const response = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Upload response error:", response.status, errorText);
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
        setIsUploading(false);
      }
    },
    [chatId],
  );

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
    event.target.value = "";
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const fetchMessageDocuments = useCallback(async (messageId: string) => {
    try {
      const response = await fetch(`/api/files/message/${messageId}`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setMessageDocuments((prev) => ({
          ...prev,
          [messageId]: data.documents,
        }));
      }
    } catch (error) {
      console.error("Error fetching message documents:", error);
    }
  }, []);

  const openDocumentPreview = (document: MessageDocument) => {
    setPreviewDocument(document);
    setIsPreviewModalOpen(true);
  };

  const closeDocumentPreview = () => {
    setIsPreviewModalOpen(false);
    setPreviewDocument(null);
  };

  useEffect(() => {
    messages.forEach((message) => {
      if (!messageDocuments[message.id]) {
        fetchMessageDocuments(message.id);
      }
    });
  }, [messages, fetchMessageDocuments]); // Removed messageDocuments from deps to prevent unnecessary re-runs

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (text.trim() || uploadedFiles.length > 0) {
      await sendMessage({ text: text.trim() });
      setText("");
      setUploadedFiles([]);
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex-1 overflow-hidden">
          <Conversation className="h-full">
            <ConversationContent>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <BotIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">
                      Welcome to AI Chat
                    </h3>
                    <p className="text-sm">
                      Start a conversation by typing a message below.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      <div className="whitespace-pre-wrap">
                        {message.parts.map((part, index) =>
                          part.type === "text" ? (
                            <span key={index}>{part.text}</span>
                          ) : null,
                        )}
                      </div>

                      <DocumentAttachments
                        documents={messageDocuments[message.id] || []}
                        onPreview={openDocumentPreview}
                      />
                    </MessageContent>
                  </Message>
                ))
              )}
              <div ref={messagesEndRef} />
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>

        <div className="p-4 bg-background">
          <PromptInput onSubmit={handleSubmit}>
            <TextInputAttachments
              files={uploadedFiles}
              onRemoveFile={removeFile}
            />
            <PromptInputTextarea
              onChange={(e) => setText(e.target.value)}
              value={text}
              placeholder="Type your message..."
              disabled={status !== "ready" || isUploading}
            />
            <PromptInputToolbar>
              <PromptInputTools>
                <PromptInputButton
                  disabled={status !== "ready" || isUploading}
                  onClick={triggerFileSelect}
                >
                  <PaperclipIcon size={16} />
                </PromptInputButton>
                <PromptInputButton disabled={status !== "ready" || isUploading}>
                  <MicIcon size={16} />
                  <span>Voice</span>
                </PromptInputButton>
                <PromptInputModelSelect
                  onValueChange={setModel}
                  value={model}
                  disabled={status !== "ready" || isUploading}
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
              <PromptInputSubmit
                disabled={
                  (!text.trim() && uploadedFiles.length === 0) ||
                  status !== "ready" ||
                  isUploading
                }
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
            accept={SUPPORTED_FILE_TYPES.join(",")}
          />
        </div>

        <PDFPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={closeDocumentPreview}
          document={previewDocument}
        />
      </div>
    </ErrorBoundary>
  );
}
