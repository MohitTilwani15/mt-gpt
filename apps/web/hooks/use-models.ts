import useSWR from 'swr';

export interface ChatModel {
  id: string;
  name: string;
}

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
  return useSWR<ModelsResponse>('/api/chat/models', fetchSupportedModels);
};
