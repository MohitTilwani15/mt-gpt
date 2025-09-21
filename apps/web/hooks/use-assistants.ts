import useSWR from 'swr';

import { fetchJson, resolveApiUrl } from '@/lib/http';

export interface AssistantSummary {
  id: string;
  name: string;
  description?: string | null;
  defaultModel?: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  assistantId?: string | null;
}

export interface AssistantKnowledgeItem {
  id: string;
  assistantId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  downloadUrl: string;
}

export interface AssistantShareSummary {
  share: {
    assistantId: string;
    userId: string;
    canManage: boolean;
    createdAt: string;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface AssistantDetail extends AssistantSummary {
  instructions?: string | null;
  capabilities?: Record<string, boolean> | null;
  knowledge: AssistantKnowledgeItem[];
  shares?: Array<{ assistantId: string; userId: string; canManage: boolean; createdAt: string }>;
}

export interface CreateAssistantPayload {
  name: string;
  description?: string;
  instructions?: string;
  defaultModel?: string;
  capabilities?: {
    webSearch?: boolean;
    imageGeneration?: boolean;
  };
}

export interface UpdateAssistantPayload extends Partial<CreateAssistantPayload> {}

export const useAssistants = () => {
  return useSWR<AssistantSummary[]>(
    '/api/assistants',
    (url: string) => fetchJson<AssistantSummary[]>(url, { fallbackValue: [] }),
  );
};

export const useAssistant = (assistantId: string | undefined) => {
  return useSWR<AssistantDetail>(
    assistantId ? `/api/assistants/${assistantId}` : null,
    (url: string) => fetchJson<AssistantDetail>(url),
  );
};

export const useAssistantShares = (assistantId: string | undefined, enabled: boolean = true) => {
  return useSWR<AssistantShareSummary[]>(
    assistantId && enabled ? `/api/assistants/${assistantId}/shares` : null,
    (url: string) => fetchJson<AssistantShareSummary[]>(url, { fallbackValue: [] }),
  );
};

export const createAssistant = async (payload: CreateAssistantPayload) => {
  return fetchJson<AssistantDetail>('/api/assistants', {
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  });
};

export const updateAssistant = async (assistantId: string, payload: UpdateAssistantPayload) => {
  return fetchJson<AssistantDetail>(`/api/assistants/${assistantId}`, {
    init: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  });
};

export const deleteAssistant = async (assistantId: string) => {
  return fetchJson<{ id: string; deleted: boolean }>(`/api/assistants/${assistantId}`, {
    init: {
      method: 'DELETE',
    },
  });
};

export const shareAssistant = async (
  assistantId: string,
  payload: { email: string; canManage?: boolean },
) => {
  return fetchJson(`/api/assistants/${assistantId}/share`, {
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  });
};

export const revokeAssistantShare = async (assistantId: string, userId: string) => {
  return fetchJson(`/api/assistants/${assistantId}/share/${userId}`, {
    init: {
      method: 'DELETE',
    },
  });
};

export const uploadAssistantKnowledge = async (
  assistantId: string,
  files: FileList | File[],
) => {
  const formData = new FormData();
  const fileArray = Array.isArray(files) ? files : Array.from(files);

  fileArray.forEach((file) => formData.append('files', file));

  const response = await fetch(resolveApiUrl(`/api/assistants/${assistantId}/knowledge/upload`), {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to upload assistant knowledge');
  }

  return response.json() as Promise<AssistantKnowledgeItem[]>;
};

export const deleteAssistantKnowledge = async (assistantId: string, knowledgeId: string) => {
  return fetchJson(`/api/assistants/${assistantId}/knowledge/${knowledgeId}`, {
    init: {
      method: 'DELETE',
    },
  });
};
