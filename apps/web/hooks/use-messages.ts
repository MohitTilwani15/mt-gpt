import useSWR, { SWRConfiguration } from 'swr';
import { UIMessage } from 'ai';

import { fetchJson } from '@/lib/http';

export interface MessagesResponse {
  messages: UIMessage[];
  hasMore: boolean;
  nextCursor?: string;
  previousCursor?: string;
}

export interface GetMessagesQuery {
  limit?: string;
  startingAfter?: string;
  endingBefore?: string;
}

export const useMessages = (
  chatId: string | undefined,
  query: GetMessagesQuery = {},
) => {
  const params = new URLSearchParams();

  if (query.limit) {
    params.append('limit', query.limit);
  }

  if (query.startingAfter) {
    params.append('startingAfter', query.startingAfter);
  }

  if (query.endingBefore) {
    params.append('endingBefore', query.endingBefore);
  }

  const url = chatId ? `/api/chat/${chatId}/messages?${params.toString()}` : null;

  return useSWR<MessagesResponse>(url, (requestUrl: string) => fetchJson<MessagesResponse>(requestUrl));
};

export const useAllMessages = (
  chatId: string | undefined,
  limit: number = 100,
  config?: SWRConfiguration
) => {
  const { data, ...rest } = useMessages(chatId, { limit: limit.toString() });

  return {
    messages: data?.messages || [],
    hasMore: data?.hasMore || false,
    ...rest,
  };
};
