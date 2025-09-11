import useSWR, { SWRConfiguration } from 'swr';

export interface ChatResponse {
  chats: Array<{
    id: string;
    title: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
  }>;
  hasMore: boolean;
  nextCursor?: string;
}

export interface CreateChatRequest {
  id: string;
}

export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
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

  return useSWR<ChatResponse>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    dedupingInterval: 30000,
    errorRetryCount: 0,
    ...config,
  });
};

export const useChat = (chatId: string | undefined, config?: SWRConfiguration) => {
  return useSWR<Chat>(
    chatId ? `/api/chat/${chatId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 30000,
      errorRetryCount: 0,
      ...config,
    }
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