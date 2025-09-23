import {
  ApiError,
  fetchJson,
  getApiBaseUrl,
  resolveApiUrl,
  setApiBaseUrl,
} from "@workspace/api";

const DEFAULT_BASE_URL = "https://gpt.alphalink.xyz";

setApiBaseUrl(process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL);

export const API_BASE_URL = getApiBaseUrl();

export { ApiError, fetchJson, resolveApiUrl };
