import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Chat as ChatClient, useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { v4 as uuidv4 } from "uuid";
import {
  Button,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  MessageBarActions,
  Option,
  Spinner,
  Textarea,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { authClient } from "../lib/auth-client";
import { AuthPanel } from "./AuthPanel";
import { getApiUrl } from "../utils/api";

interface ChatModel {
  id: string;
  name: string;
  supportsReasoning?: boolean;
}

const LOCAL_STORAGE_KEY = "word-addin-selected-chat-model";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
    height: "100%",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  headerInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  signedInAs: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  messageBubble: {
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusLarge,
    maxWidth: "85%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    boxShadow: tokens.shadow4,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  assistantMessage: {
    alignSelf: "flex-start",
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  messageRole: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },
  messageText: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
  },
  reasoning: {
    padding: "10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorPaletteBlueBorderActive}`,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
  },
  fileLink: {
    color: tokens.colorBrandForegroundLink,
    textDecoration: "none",
    wordBreak: "break-word",
  },
  placeholder: {
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
    padding: "48px 0",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    alignItems: "center",
    justifyContent: "center",
  },
  inputSection: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "12px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  actionsSpacer: {
    flex: 1,
  },
  statusText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  spinner: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  authWrapper: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  authCard: {
    width: "100%",
    maxWidth: "420px",
  },
  loadingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    color: tokens.colorNeutralForeground3,
  },
});

export const Chat: React.FC = () => {
  const styles = useStyles();
  const { data: session, isPending: isSessionLoading, error: sessionError } = authClient.useSession();
  const [chatId, setChatId] = useState(() => uuidv4());
  const [models, setModels] = useState<ChatModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(LOCAL_STORAGE_KEY) || "";
    }
    return "";
  });
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isInitializingChat, setIsInitializingChat] = useState(false);

  const chatIdRef = useRef(chatId);
  const selectedModelRef = useRef(selectedModel);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousSessionRef = useRef<typeof session>(session);

  const updateSelectedModel = useCallback((modelId: string) => {
    setSelectedModelState(modelId);
    selectedModelRef.current = modelId;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, modelId);
    }
  }, []);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    let isActive = true;

    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const response = await fetch(getApiUrl("/api/chat/models"), {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("You need to sign in to load models.");
          }
          throw new Error("Failed to load supported models");
        }

        const data: { models: ChatModel[]; defaultModel: string } = await response.json();

        if (!isActive) {
          return;
        }

        setModels(data.models);
        setDefaultModel(data.defaultModel);

        const hasExistingSelection =
          selectedModelRef.current && data.models.some((model) => model.id === selectedModelRef.current);

        if (hasExistingSelection) {
          updateSelectedModel(selectedModelRef.current);
        } else if (data.models.length > 0) {
          const fallbackModel = data.models.find((model) => model.id === data.defaultModel) || data.models[0];
          updateSelectedModel(fallbackModel.id);
        }
      } catch (err) {
        console.error("Error loading chat models:", err);
        if (isActive) {
          setError(err instanceof Error ? err.message : "We could not load available models. Please try again later.");
        }
      } finally {
        if (isActive) {
          setIsLoadingModels(false);
        }
      }
    };

    if (!session) {
      setModels([]);
      setIsLoadingModels(false);
    } else {
      loadModels();
    }

    return () => {
      isActive = false;
    };
  }, [session, updateSelectedModel]);

  const initializeChat = useCallback(async (id: string) => {
    if (!session) {
      return;
    }

    setIsInitializingChat(true);
    try {
      const response = await fetch(getApiUrl("/api/chat/create"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Your session expired. Please sign in again.");
        }
        const message = await response.text();
        throw new Error(message || "Failed to initialize chat");
      }

      setError(null);
    } catch (err) {
      console.error("Error initializing chat:", err);
      setError(err instanceof Error ? err.message : "We couldn't start a new chat session. Please try again.");
    } finally {
      setIsInitializingChat(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    initializeChat(chatIdRef.current);
  }, [chatId, initializeChat, session]);

  const chatClientRef = useRef<ChatClient<UIMessage> | null>(null);

  if (!chatClientRef.current) {
    chatClientRef.current = new ChatClient<UIMessage>({
      generateId: () => uuidv4(),
      transport: new DefaultChatTransport({
        api: getApiUrl("/api/chat"),
        credentials: "include",
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          return {
            body: {
              id: chatIdRef.current,
              selectedChatModel: selectedModelRef.current,
              message: lastMessage,
            },
          };
        },
      }),
    });
  }

  const chatInstance = chatClientRef.current;

  const {
    messages,
    status,
    sendMessage,
    stop,
    setMessages,
    error: chatError,
    clearError: clearChatError,
  } = useChat({ chat: chatInstance });

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
      setSelectedModelState("");
      selectedModelRef.current = "";
      setError(null);
      const newChatId = uuidv4();
      setChatId(newChatId);
    }
    previousSessionRef.current = session;
  }, [session, stop, setMessages, setModels, setChatId, setSelectedModelState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const canSend =
    input.trim().length > 0 &&
    status === "ready" &&
    !isInitializingChat &&
    !isLoadingModels &&
    Boolean(selectedModelRef.current) &&
    Boolean(session);

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
      console.error("Error sending message:", err);
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
    const newChatId = uuidv4();
    setChatId(newChatId);
  };

  const handleSignOut = async () => {
    try {
      stop?.();
      await authClient.signOut();
    } catch (err) {
      console.error("Error signing out:", err);
      setError("We couldn't sign you out. Please try again.");
    }
  };

  const dismissError = () => {
    clearChatError?.();
    setError(null);
  };

  const renderMessageContent = (message: UIMessage) => {
    return message.parts.map((part, index) => {
      if (part.type === "text") {
        return (
          <span key={`${message.id}-text-${index}`} className={styles.messageText}>
            {part.text}
          </span>
        );
      }

      if (part.type === "reasoning" && typeof part.text === "string") {
        return (
          <div key={`${message.id}-reasoning-${index}`} className={styles.reasoning}>
            {part.text}
          </div>
        );
      }

      if (part.type === "file") {
        const filename = (part as { filename?: string }).filename;
        const url = (part as { url?: string }).url;
        if (url) {
          return (
            <a
              key={`${message.id}-file-${index}`}
              href={url}
              className={styles.fileLink}
              target="_blank"
              rel="noreferrer"
            >
              {filename || "View attached file"}
            </a>
          );
        }
      }

      return (
        <span key={`${message.id}-unknown-${index}`} className={styles.messageText}>
          {part.type}
        </span>
      );
    });
  };

  const streaming = status === "streaming";
  const errorBar = error ? (
    <MessageBar intent="error" role="alert">
      <MessageBarBody>
        <MessageBarTitle>Something went wrong</MessageBarTitle>
        {error}
      </MessageBarBody>
      <MessageBarActions>
        <Button appearance="outline" onClick={dismissError}>
          Dismiss
        </Button>
      </MessageBarActions>
    </MessageBar>
  ) : null;

  if (isSessionLoading) {
    return (
      <div className={styles.root}>
        <div className={styles.authWrapper}>
          <div className={styles.loadingState}>
            <Spinner size="medium" />
            <Text>Checking your account...</Text>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.root}>
        <div className={styles.authWrapper}>
          <div className={styles.authCard}>
            {errorBar}
            <AuthPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <Text size={400} weight="semibold">
            Chat Assistant
          </Text>
          {session?.user?.email && (
            <Text className={styles.signedInAs}>Signed in as {session.user.email}</Text>
          )}
        </div>
        <div className={styles.actionsRow}>
          <Button onClick={handleSignOut} appearance="secondary">
            Sign out
          </Button>
          <Button onClick={handleNewChat} appearance="primary" disabled={streaming || isInitializingChat}>
            New conversation
          </Button>
          {(streaming || isInitializingChat) && (
            <div className={styles.spinner}>
              <Spinner size="tiny" labelPosition="after" label={streaming ? "Generating response" : "Preparing chat"} />
            </div>
          )}
        </div>
      </div>

      {errorBar}

      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.placeholder}>
            <Text weight="semibold">Start a new conversation</Text>
            <Text>Send a prompt below to begin chatting with the assistant.</Text>
          </div>
        ) : (
          messages.map((message) => {
            const isUser = message.role === "user";
            const bubbleStyles = [styles.messageBubble, isUser ? styles.userMessage : styles.assistantMessage];

            return (
              <div key={message.id} className={bubbleStyles.join(" ")}>
                <span className={styles.messageRole}>{isUser ? "You" : "Assistant"}</span>
                {renderMessageContent(message)}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputSection} onSubmit={handleSubmit}>
        <Field label="Model">
          <Dropdown
            placeholder={isLoadingModels ? "Loading models..." : "Select a model"}
            selectedOptions={selectedModel ? [selectedModel] : []}
            onOptionSelect={(_event, data) => {
              if (data.optionValue) {
                updateSelectedModel(data.optionValue);
              }
            }}
            disabled={isLoadingModels || streaming || isInitializingChat || models.length === 0}
          >
            {models.map((model) => (
              <Option key={model.id} value={model.id}>
                {model.name}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Field label="Message">
          <Textarea
            value={input}
            onChange={(_event, data) => setInput(data.value)}
            placeholder={isInitializingChat ? "Preparing chat..." : "Ask the assistant anything"}
            disabled={isInitializingChat || isLoadingModels}
            rows={4}
          />
        </Field>

        <div className={styles.actionsRow}>
          <div className={styles.actionsSpacer}>
            <Text className={styles.statusText}>
              {streaming
                ? "The assistant is responding..."
                : status === "submitted"
                ? "Sending your message..."
                : ""}
            </Text>
          </div>
          {streaming && (
            <Button type="button" appearance="secondary" onClick={() => stop?.()}>
              Stop generating
            </Button>
          )}
          <Button appearance="primary" type="submit" disabled={!canSend}>
            Send message
          </Button>
        </div>
      </form>
    </div>
  );
};
