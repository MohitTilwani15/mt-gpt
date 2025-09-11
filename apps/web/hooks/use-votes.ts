import useSWR, { SWRConfiguration, mutate } from 'swr';

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

const fetcher = async (url: string) => {
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    return [];
  }

  return await response.json();
};

export const useVotes = (chatId: string | undefined, config?: SWRConfiguration) => {
  return useSWR<Vote[]>(
    chatId ? `/api/chat/votes?chatId=${chatId}` : null,
    fetcher,
  );
};

export const updateVote = async (data: UpdateVoteRequest): Promise<Vote> => {
  const response = await fetch('/api/chat/vote', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to update vote');
  }

  const result = await response.json();

  mutate<Vote[]>(
    `/api/chat/votes?chatId=${data.chatId}`,
    (currentVotes) => {
      if (!currentVotes) return [];

      const votesWithoutCurrent = currentVotes.filter(
        (vote) => vote.messageId !== data.messageId,
      );

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