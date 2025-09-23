const ABSOLUTE_URL_REGEX = /^https?:\/\//i;

let baseApiUrl = "";

export const setApiBaseUrl = (value?: string | null) => {
  baseApiUrl = value ?? "";
  return baseApiUrl;
};

export const getApiBaseUrl = () => baseApiUrl;

const joinPath = (path: string) => (path.startsWith("/") ? path : `/${path}`);

export const resolveApiUrl = (path: string, baseUrl?: string) => {
  if (ABSOLUTE_URL_REGEX.test(path)) {
    return path;
  }

  const base = baseUrl ?? baseApiUrl;
  if (!base) {
    return joinPath(path);
  }

  return `${base}${joinPath(path)}`;
};

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

export interface FetchJsonOptions<T> {
  init?: RequestInit;
  credentials?: RequestCredentials;
  fallbackValue?: T;
  errorMessage?: string;
  allowEmpty?: boolean;
  baseUrl?: string;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  {
    init,
    credentials = "include",
    fallbackValue,
    errorMessage,
    allowEmpty = false,
    baseUrl,
  }: FetchJsonOptions<T> = {},
): Promise<T> {
  const resolvedInput =
    typeof input === "string" ? resolveApiUrl(input, baseUrl) : input;

  const response = await fetch(resolvedInput, {
    credentials,
    ...init,
  });

  if (!response.ok) {
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }

    throw new ApiError(response.status, response.statusText, errorMessage);
  }

  if (response.status === 204) {
    return fallbackValue as T;
  }

  const text = await response.text();

  if (!text) {
    if (allowEmpty || fallbackValue !== undefined) {
      return fallbackValue as T;
    }

    throw new ApiError(response.status, response.statusText, errorMessage ?? "Empty response body");
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }

    throw new ApiError(response.status, response.statusText, errorMessage ?? "Failed to parse response JSON");
  }
}
