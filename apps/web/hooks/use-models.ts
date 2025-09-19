import useSWR from 'swr';

import { fetchJson } from '@/lib/http';

export interface ChatModel {
  id: string;
  name: string;
  supportsReasoning: boolean;
}

export interface ModelsResponse {
  models: ChatModel[];
  defaultModel: string;
}

export const useSupportedModels = () => {
  return useSWR<ModelsResponse>('/api/chat/models', () => fetchJson<ModelsResponse>('/api/chat/models'));
};
