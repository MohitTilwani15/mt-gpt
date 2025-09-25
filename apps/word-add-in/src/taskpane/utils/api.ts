import {
  getApiBaseUrl as getSharedApiBaseUrl,
  resolveApiUrl,
  setApiBaseUrl,
} from "@workspace/client/lib/api";

const DEFAULT_BASE_URL = "https://mt-gpt-production.up.railway.app";

setApiBaseUrl(process.env.WORD_ADDIN_API_URL ?? DEFAULT_BASE_URL);

export const getApiBaseUrl = () => getSharedApiBaseUrl();

export const getApiUrl = (path: string) => resolveApiUrl(path);
