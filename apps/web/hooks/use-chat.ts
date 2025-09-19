import useSWR, { SWRConfiguration } from 'swr';

import { fetchJson } from '@/lib/http';

export interface CreateChatRequest {
  id: string;
}

export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  isPublic?: boolean;
  isArchived?: boolean;
}

export interface ChatResponse {
  chats: Chat[];
  hasMore: boolean;
  nextCursor?: string;
}

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

  return useSWR<ChatResponse>(key, (requestUrl: string) => fetchJson<ChatResponse>(requestUrl), {
    ...config,
  });
};

export const useChat = (chatId: string | undefined, config?: SWRConfiguration) => {
  return useSWR<Chat>(
    chatId ? `/api/chat/${chatId}` : null,
    (requestUrl: string) => fetchJson<Chat>(requestUrl),
    { ...config },
  );
};

export const createChat = async (data: CreateChatRequest): Promise<Chat> => {
  return fetchJson<Chat>('/api/chat/create', {
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    },
  });
};

export const deleteChat = async (chatId: string): Promise<{ id: string; deleted: boolean } | void> => {
  return fetchJson<{ id: string; deleted: boolean } | void>(`/api/chat/${chatId}`, {
    init: {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    },
    allowEmpty: true,
  });
};

export const updateChatVisibility = async (chatId: string, isPublic: boolean) => {
  return fetchJson(`/api/chat/${chatId}/visibility`, {
    init: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isPublic }),
    },
  });
};

export const archiveChat = async (chatId: string, isArchived: boolean = true) => {
  return fetchJson(`/api/chat/${chatId}/archive`, {
    init: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isArchived }),
    },
  });
};
