export interface ChatModel {
  id: string;
  name: string;
  supportsReasoning?: boolean;
}

export interface ModelsResponse {
  models: ChatModel[];
  defaultModel: string;
}

export interface CreateChatRequest {
  id: string;
  assistantId?: string;
}

export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  isPublic?: boolean;
  isArchived?: boolean;
  assistantId?: string | null;
}

export interface ChatResponse {
  chats: Chat[];
  hasMore: boolean;
  nextCursor?: string;
}
