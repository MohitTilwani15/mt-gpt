import { fetchJson, type FetchJsonOptions } from "@workspace/api";

import type { Chat, ChatResponse, CreateChatRequest } from "./types";

type AnyFetchOptions<T> = FetchJsonOptions<T> | undefined;

type HeadersInit = RequestInit["headers"];

const mergeInit = <T>(options: AnyFetchOptions<T>, baseInit: RequestInit): RequestInit => {
  const existingInit = options?.init ?? {};
  const mergedHeaders: HeadersInit = {
    ...(baseInit.headers ?? {}),
    ...(existingInit.headers ?? {}),
  } as HeadersInit;

  return {
    ...baseInit,
    ...existingInit,
    headers: mergedHeaders,
  };
};

export const createChat = async (
  data: CreateChatRequest,
  options?: FetchJsonOptions<Chat>,
): Promise<Chat> => {
  return fetchJson<Chat>("/api/chat/create", {
    ...options,
    init: mergeInit(options, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  });
};

export const deleteChat = async (
  chatId: string,
  options?: FetchJsonOptions<{ id: string; deleted: boolean } | void>,
) => {
  return fetchJson<{ id: string; deleted: boolean } | void>(`/api/chat/${chatId}`, {
    allowEmpty: true,
    ...options,
    init: mergeInit(options, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }),
  });
};

export const updateChatVisibility = async (
  chatId: string,
  isPublic: boolean,
  options?: FetchJsonOptions<void>,
) => {
  return fetchJson<void>(`/api/chat/${chatId}/visibility`, {
    ...options,
    init: mergeInit(options, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic }),
    }),
  });
};

export const archiveChat = async (
  chatId: string,
  isArchived: boolean = true,
  options?: FetchJsonOptions<void>,
) => {
  return fetchJson<void>(`/api/chat/${chatId}/archive`, {
    ...options,
    init: mergeInit(options, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived }),
    }),
  });
};

export const fetchChats = (
  params: { limit?: number; startingAfter?: string; endingBefore?: string } = {},
  options?: FetchJsonOptions<ChatResponse>,
) => {
  const { limit = 50, startingAfter, endingBefore } = params;
  const searchParams = new URLSearchParams({ limit: String(limit) });

  if (startingAfter) {
    searchParams.append("startingAfter", startingAfter);
  }

  if (endingBefore) {
    searchParams.append("endingBefore", endingBefore);
  }

  return fetchJson<ChatResponse>(`/api/chat?${searchParams.toString()}`, options);
};
