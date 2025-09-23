import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import { UIMessage } from "ai";
import {
  Loader2,
  LogOut,
  MessageSquare,
  PlusCircle,
  Send,
  StopCircle,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";

import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  ChatContextSnapshot,
  ChatModel,
  createChat,
  createChatClient,
  fetchChatModels,
} from "@workspace/chat";

import { authClient } from "../lib/auth-client";
import { AuthPanel } from "./AuthPanel";

const LOCAL_STORAGE_KEY = "word-addin-selected-chat-model";

const createErrorBanner = (message: string, onDismiss?: () => void) => (
  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-semibold">Something went wrong</p>
        <p>{message}</p>
      </div>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      )}
    </div>
  </div>
);

const resolveStoredModel = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(LOCAL_STORAGE_KEY) || "";
};

export const Chat: React.FC = () => {
  const {
    data: session,
    isPending: isSessionLoading,
    error: sessionError,
  } = authClient.useSession();

  const [chatId, setChatId] = useState<string>(() => uuidv4());
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => resolveStoredModel());
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isInitializingChat, setIsInitializingChat] = useState(false);

  const chatContextRef = useRef<ChatContextSnapshot>({
    chatId,
    selectedModel: selectedModel || undefined,
  });
  const selectedModelRef = useRef(selectedModel);
  const chatIdRef = useRef(chatId);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousSessionRef = useRef<typeof session>(session);

  const chatClientRef = useRef(createChatClient({
    getContext: () => chatContextRef.current,
  }));

  const {
    messages,
    status,
    sendMessage,
    stop,
    setMessages,
    error: chatError,
    clearError: clearChatError,
  } = useChat({ chat: chatClientRef.current });

  useEffect(() => {
    chatIdRef.current = chatId;
    chatContextRef.current.chatId = chatId;
  }, [chatId]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
    chatContextRef.current.selectedModel = selectedModel || undefined;
  }, [selectedModel]);

  const updateSelectedModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    selectedModelRef.current = modelId;
    chatContextRef.current.selectedModel = modelId || undefined;
    if (typeof window !== "undefined") {
      if (modelId) {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, modelId);
      } else {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadModels = async () => {
      if (!session) {
        setModels([]);
        updateSelectedModel("");
        setIsLoadingModels(false);
        return;
      }

      setIsLoadingModels(true);

      try {
        const data = await fetchChatModels();
        if (!isActive) {
          return;
        }

        setModels(data.models);

        if (data.models.length === 0) {
          updateSelectedModel("");
          return;
        }

        const storedModel = selectedModelRef.current;
        const storedModelExists = storedModel
          ? data.models.some((model) => model.id === storedModel)
          : false;

        if (storedModelExists) {
          updateSelectedModel(storedModel);
        } else {
          const fallback = data.models.find((model) => model.id === data.defaultModel) || data.models[0];
          updateSelectedModel(fallback.id);
        }
      } catch (err) {
        console.error("Error loading chat models", err);
        if (isActive) {
          setError(
            err instanceof Error
              ? err.message
              : "We couldn't load available models. Please try again later.",
          );
          setModels([]);
          updateSelectedModel("");
        }
      } finally {
        if (isActive) {
          setIsLoadingModels(false);
        }
      }
    };

    loadModels();

    return () => {
      isActive = false;
    };
  }, [session, updateSelectedModel]);

  const initializeChat = useCallback(
    async (id: string) => {
      if (!session) {
        return;
      }

      setIsInitializingChat(true);
      try {
        await createChat({ id });
        setError(null);
      } catch (err) {
        console.error("Error initializing chat", err);
        setError(
          err instanceof Error
            ? err.message
            : "We couldn't start a new chat session. Please try again.",
        );
      } finally {
        setIsInitializingChat(false);
      }
    },
    [session],
  );

  useEffect(() => {
    if (!session) {
      return;
    }

    initializeChat(chatIdRef.current);
  }, [chatId, initializeChat, session]);

  useEffect(() => {
    if (chatError) {
      setError(chatError.message || "Something went wrong while communicating with the server.");
    }
  }, [chatError]);

  useEffect(() => {
    if (sessionError) {
      console.error("Session error", sessionError);
      setError("We couldn't verify your session. Please sign in again.");
    }
  }, [sessionError]);

  useEffect(() => {
    const previousSession = previousSessionRef.current;
    if (!session && previousSession) {
      stop?.();
      setInput("");
      setMessages([]);
      setModels([]);
      updateSelectedModel("");
      setError(null);
      const newChatId = uuidv4();
      setChatId(newChatId);
    }
    previousSessionRef.current = session;
  }, [session, stop, setMessages, updateSelectedModel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canSend = useMemo(() => {
    return (
      input.trim().length > 0 &&
      status === "ready" &&
      !isInitializingChat &&
      !isLoadingModels &&
      Boolean(selectedModelRef.current) &&
      Boolean(session)
    );
  }, [input, status, isInitializingChat, isLoadingModels, session]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    if (!session) {
      setError("Please sign in to send a message.");
      return;
    }

    const trimmed = input.trim();

    try {
      setError(null);
      await sendMessage({ text: trimmed });
      setInput("");
    } catch (err) {
      console.error("Error sending message", err);
      setError("Your message could not be sent. Please try again.");
    }
  };

  const handleNewChat = () => {
    if (!session) {
      return;
    }

    clearChatError?.();
    setError(null);
    setMessages([]);
    setInput("");
    const newChatId = uuidv4();
    setChatId(newChatId);
  };

  const handleSignOut = async () => {
    try {
      stop?.();
      await authClient.signOut();
    } catch (err) {
      console.error("Error signing out", err);
      setError("We couldn't sign you out. Please try again.");
    }
  };

  const dismissError = () => {
    clearChatError?.();
    setError(null);
  };

  const renderMessagePart = (message: UIMessage, index: number) => {
    const part = message.parts[index];

    if (!part) {
      return null;
    }

    switch (part.type) {
      case "text":
        return (
          <p key={`${message.id}-text-${index}`} className="whitespace-pre-wrap text-sm leading-6">
            {part.text}
          </p>
        );
      case "reasoning":
        if (typeof part.text === "string" && part.text.trim().length > 0) {
          return (
            <div
              key={`${message.id}-reasoning-${index}`}
              className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm"
            >
              {part.text}
            </div>
          );
        }
        return null;
      case "file": {
        const filePart = part as { filename?: string; url?: string };
        if (filePart.url) {
          return (
            <a
              key={`${message.id}-file-${index}`}
              href={filePart.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {filePart.filename || "View attached file"}
            </a>
          );
        }
        return null;
      }
      default:
        return (
          <></>
        );
    }
  };

  const streaming = status === "streaming";
  const statusMessage = streaming
    ? "The assistant is responding..."
    : status === "submitted"
    ? "Sending your message..."
    : isInitializingChat
    ? "Preparing chat..."
    : "";

  if (isSessionLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p>Checking your account...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {error && createErrorBanner(error, dismissError)}
          <AuthPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 px-4 pb-4">
      <header className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card px-4 py-4 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Chat Assistant</h1>
          {session?.user?.email && (
            <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            variant="ghost"
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={handleNewChat}
            disabled={streaming || isInitializingChat}
            className="flex items-center gap-2"
          >
            <PlusCircle className="size-4" />
            New conversation
          </Button>
          {(streaming || isInitializingChat) && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {streaming ? "Generating response" : "Preparing chat"}
            </span>
          )}
        </div>
      </header>

      {error && createErrorBanner(error, dismissError)}

      <ScrollArea className="flex-1 rounded-2xl border border-border/60 bg-muted/20 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <p className="text-base font-medium text-foreground">Start a new conversation</p>
              <p className="text-sm text-muted-foreground">
                Send a prompt below to begin chatting with the assistant.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-2xl border px-4 py-3 shadow-sm ${
                    isUser
                      ? "ml-auto border-primary/20 bg-primary text-primary-foreground"
                      : "border-border/60 bg-card text-card-foreground"
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {isUser ? "You" : "Assistant"}
                  </span>
                  <div className="mt-2 space-y-3">
                    {message.parts.map((_part, index) => renderMessagePart(message, index))}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="model-select">Model</Label>
            <Select
              value={selectedModel || ""}
              onValueChange={(value) => updateSelectedModel(value)}
              disabled={isLoadingModels || streaming || isInitializingChat || models.length === 0}
            >
              <SelectTrigger id="model-select">
                <SelectValue placeholder={isLoadingModels ? "Loading models..." : "Select a model"} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoadingModels && models.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No models are available for your account. Please check your API configuration.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-input">Message</Label>
          <Textarea
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={isInitializingChat ? "Preparing chat..." : "Ask the assistant anything"}
            disabled={isInitializingChat || isLoadingModels}
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="flex-1 text-sm text-muted-foreground">{statusMessage}</span>
          {streaming && (
            <Button
              type="button"
              variant="outline"
              onClick={() => stop?.()}
              className="flex items-center gap-2"
            >
              <StopCircle className="size-4" />
              Stop generating
            </Button>
          )}
          <Button type="submit" disabled={!canSend} className="flex items-center gap-2">
            <Send className="size-4" />
            Send message
          </Button>
        </div>
      </form>
    </div>
  );
};
