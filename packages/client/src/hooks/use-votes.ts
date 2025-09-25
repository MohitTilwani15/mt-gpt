import useSWR, { SWRConfiguration, mutate } from 'swr';

import { fetchJson } from '../lib/http';

export interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

export interface UpdateVoteRequest {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}

export const useVotes = (chatId: string | undefined, config?: SWRConfiguration) => {
  return useSWR<Vote[]>(
    chatId ? `/api/chat/votes?chatId=${chatId}` : null,
    (url: string) => fetchJson<Vote[]>(url, { fallbackValue: [] }),
    config,
  );
};

export const updateVote = async (data: UpdateVoteRequest): Promise<Vote> => {
  const result = await fetchJson<Vote>('/api/chat/vote', {
    init: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    },
  });

  mutate<Vote[]>(
    `/api/chat/votes?chatId=${data.chatId}`,
    (currentVotes) => {
      const votesWithoutCurrent = currentVotes?.filter(
        (vote) => vote.messageId !== data.messageId,
      ) ?? [];

      return [
        ...votesWithoutCurrent,
        {
          chatId: data.chatId,
          messageId: data.messageId,
          isUpvoted: data.type === 'up',
        },
      ];
    },
    { revalidate: false },
  );

  return result;
};

export const getVoteForMessage = (votes: Vote[] | undefined, messageId: string): Vote | null => {
  return votes?.find(vote => vote.messageId === messageId) || null;
};
