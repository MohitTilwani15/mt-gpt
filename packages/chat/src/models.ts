import { fetchJson, type FetchJsonOptions } from "@workspace/api";

import type { ModelsResponse } from "./types";

export interface FetchModelsOptions extends FetchJsonOptions<ModelsResponse> {}

export const fetchChatModels = (options?: FetchModelsOptions) => {
  return fetchJson<ModelsResponse>("/api/chat/models", options);
};
