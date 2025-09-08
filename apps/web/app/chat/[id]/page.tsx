"use client";

import { v4 as uuidv4 } from "uuid";
import { MicIcon, PaperclipIcon, BotIcon, FileIcon, ArrowLeftIcon } from "lucide-react";
import {
  FormEventHandler,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";

import { SUPPORTED_FILE_TYPES, formatFileSize } from "../../../lib/utils";
import ErrorBoundary from "../../../components/error-boundary";
import MarkdownRenderer from "../../../components/markdown-renderer";

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
import { Button } from "@workspace/ui/components/button";

const PDFPreviewModal = dynamic(
  () => import("../../../components/pdf-preview-modal"),
  {
    loading: () => <div>Loading preview...</div>,
  },
);
const DocumentAttachments = dynamic(
  () => import("../../../components/document-attachments"),
  {
    loading: () => <div>Loading attachments...</div>,
  },
);
const TextInputAttachments = dynamic(
  () => import("../../../components/text-input-attachments"),
  {
    loading: () => <div>Loading attachments...</div>,
  },
);

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

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const chatId = params.id as string;
  
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [messageDocuments, setMessageDocuments] = useState<
    Record<string, MessageDocument[]>
  >({});
  const [messageAttachments, setMessageAttachments] = useState<
    Record<string, UploadedFile[]>
  >({});
  const [pendingAttachments, setPendingAttachments] = useState<UploadedFile[]>([]);
  const [previewDocument, setPreviewDocument] =
    useState<MessageDocument | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
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

  // Load existing chat messages
  useEffect(() => {
    const loadChat = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch chat details and messages using the messages endpoint
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
        
        // Transform the messages to the expected format and set them
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
        setIsUploading(true);
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

  const fetchMessageAttachments = useCallback(async (messageId: string) => {
    try {
      const response = await fetch(`/api/files/message/${messageId}`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const uploadedFiles = data.documents.map((doc: any) => ({
          id: doc.id,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          downloadUrl: doc.downloadUrl || `/api/files/download/${doc.id}`,
          file: null,
        }));
        setMessageAttachments(prev => ({
          ...prev,
          [messageId]: uploadedFiles
        }));
      }
    } catch (error) {
      console.error("Error fetching message attachments:", error);
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

      if (!messageAttachments[message.id] && message.id !== messages[messages.length - 1]?.id) {
        fetchMessageAttachments(message.id);
      }
    });
  }, [messages, fetchMessageDocuments, fetchMessageAttachments, messageAttachments]);

  useEffect(() => {
    if (pendingAttachments.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'user' && !messageAttachments[lastMessage.id]) {
        setMessageAttachments(prev => ({
          ...prev,
          [lastMessage.id]: [...pendingAttachments]
        }));
        setPendingAttachments([]);

        setTimeout(() => {
          fetchMessageAttachments(lastMessage.id);
        }, 1000);
      }
    }
  }, [messages, pendingAttachments, messageAttachments, fetchMessageAttachments]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (text.trim() || uploadedFiles.length > 0) {
      const currentFiles = [...uploadedFiles];
      await sendMessage({ text: text.trim() });
      setText("");
      setUploadedFiles([]);
      
      if (currentFiles.length > 0) {
        setPendingAttachments(currentFiles);
      }
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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <Button variant="ghost" onClick={handleBack} className="gap-2">
            <ArrowLeftIcon size={16} />
            Back
          </Button>
          <h1 className="text-lg font-semibold">Chat</h1>
          <div className="w-8" /> {/* Spacer for alignment */}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <Conversation className="h-full">
            <ConversationContent>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <BotIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">
                      No messages yet
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
                      <div>
                        {message.parts.map((part, index) =>
                          part.type === "text" ? (
                            <div key={index}>
                              <MarkdownRenderer content={part.text} />
                            </div>
                          ) : null,
                        )}
                      </div>

                      {/* Show attachments for messages */}
                      {messageAttachments[message.id] && messageAttachments[message.id]!.length > 0 && (
                        <div className="mt-2">
                          <div className="flex flex-wrap gap-2">
                            {messageAttachments[message.id]!.map((file) => (
                              <div
                                key={file.id}
                                className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border max-w-xs"
                              >
                                <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{file.fileName}</p>
                                  <p className="text-xs text-muted-foreground">{formatFileSize(file.fileSize)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

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

        {/* Input Area */}
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
