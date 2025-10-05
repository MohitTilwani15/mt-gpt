import {
  ApiError,
  fetchJson,
  resolveApiUrl,
  setApiBaseUrl,
} from "./api";

const DEFAULT_BASE_URL = "http://localhost:3000";

setApiBaseUrl(DEFAULT_BASE_URL);

export { ApiError, fetchJson, resolveApiUrl };
