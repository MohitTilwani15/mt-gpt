import useSWR, { SWRConfiguration } from 'swr';

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

const fetcher = async (url: string) => {
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${url}`);
  }

  return await response.json();
};

export const useChats = (
  limit: number = 50,
  startingAfter?: string,
  endingBefore?: string,
  config?: SWRConfiguration
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

  return useSWR<ChatResponse>(url, fetcher, { ...config });
};

export const useChat = (chatId: string | undefined, config?: SWRConfiguration) => {
  return useSWR<Chat>(
    chatId ? `/api/chat/${chatId}` : null,
    fetcher,
    { ...config }
  );
};

export const createChat = async (data: CreateChatRequest): Promise<Chat> => {
  const response = await fetch('/api/chat/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create chat');
  }

  return await response.json();
};

export const deleteChat = async (chatId: string): Promise<{ id: string; deleted: boolean } | void> => {
  let res = await fetch(`/api/chat/${chatId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    res = await fetch(`/api/chat/${chatId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  }

  if (!res.ok) {
    throw new Error('Failed to delete chat');
  }

  try {
    return await res.json();
  } catch {
    return;
  }
};

export const updateChatVisibility = async (chatId: string, isPublic: boolean) => {
  const response = await fetch(`/api/chat/${chatId}/visibility`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ isPublic }),
  });

  if (!response.ok) {
    throw new Error('Failed to update chat visibility');
  }

  return await response.json();
};

export const archiveChat = async (chatId: string, isArchived: boolean = true) => {
  const response = await fetch(`/api/chat/${chatId}/archive`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ isArchived }),
  });

  if (!response.ok) {
    throw new Error('Failed to update chat archive status');
  }

  return await response.json();
};
