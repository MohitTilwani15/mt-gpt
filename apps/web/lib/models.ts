export interface ChatModel {
  id: string;
  name: string;
}

export const SUPPORTED_MODELS: ChatModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
] as const;

export const DEFAULT_LLM_MODEL = SUPPORTED_MODELS[0];
