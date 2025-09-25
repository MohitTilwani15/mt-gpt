import {
  ApiError,
  fetchJson,
  resolveApiUrl,
  setApiBaseUrl,
} from "./api";

const DEFAULT_BASE_URL = "https://mt-gpt-production.up.railway.app";

setApiBaseUrl(DEFAULT_BASE_URL);

export { ApiError, fetchJson, resolveApiUrl };
