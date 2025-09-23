import useSWR, { SWRConfiguration } from 'swr';

import { fetchJson } from '@/lib/http';
import {
  archiveChat as archiveChatShared,
  createChat as createChatShared,
  deleteChat as deleteChatShared,
  fetchChats as fetchChatsShared,
  type Chat,
  type ChatResponse,
  type CreateChatRequest,
  updateChatVisibility as updateChatVisibilityShared,
} from '@workspace/chat';

interface UseChatsOptions {
  enabled?: boolean;
}

export const useChats = (
  limit: number = 50,
  startingAfter?: string,
  endingBefore?: string,
  config?: SWRConfiguration,
  options?: UseChatsOptions,
) => {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (startingAfter) {
    params.append('startingAfter', startingAfter);
  }

  if (endingBefore) {
    params.append('endingBefore', endingBefore);
  }

  const url = `/api/chat?${params.toString()}`;
  const shouldFetch = options?.enabled ?? true;
  const key = shouldFetch ? url : null;

  return useSWR<ChatResponse>(
    key,
    () => fetchChatsShared({ limit, startingAfter, endingBefore }),
    {
      ...config,
    },
  );
};

export const useChat = (chatId: string | undefined, config?: SWRConfiguration) => {
  return useSWR<Chat>(
    chatId ? `/api/chat/${chatId}` : null,
    (requestUrl: string) => fetchJson<Chat>(requestUrl),
    { ...config },
  );
};

export const createChat = async (data: CreateChatRequest): Promise<Chat> => {
  return createChatShared(data);
};

export const deleteChat = async (chatId: string): Promise<{ id: string; deleted: boolean } | void> => {
  return deleteChatShared(chatId);
};

export const updateChatVisibility = async (chatId: string, isPublic: boolean) => {
  return updateChatVisibilityShared(chatId, isPublic);
};

export const archiveChat = async (chatId: string, isArchived: boolean = true) => {
  return archiveChatShared(chatId, isArchived);
};
