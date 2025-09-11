import useSWR from 'swr';
import { ChatModel } from './models';

export interface ModelsResponse {
  models: ChatModel[];
  defaultModel: string;
}

const fetchSupportedModels = async (): Promise<ModelsResponse> => {
  const response = await fetch('/api/chat/models', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch supported models');
  }

  return await response.json();
};

export const useSupportedModels = () => {
  return useSWR<ModelsResponse>('/api/chat/models', fetchSupportedModels, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    dedupingInterval: 60000, // Dedupe requests within 60 seconds
    errorRetryCount: 0,
    refreshInterval: 0,
  });
};