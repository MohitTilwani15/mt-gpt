import { Chat } from '../../database/schemas/conversation.schema';

export interface ChatResponse {
  chats: Chat[];
  hasMore: boolean;
}
