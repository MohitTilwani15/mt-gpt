export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
  }
}

interface FetchJsonOptions<T> {
  init?: RequestInit;
  credentials?: RequestCredentials;
  fallbackValue?: T;
  errorMessage?: string;
  allowEmpty?: boolean;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  {
    init,
    credentials = 'include',
    fallbackValue,
    errorMessage,
    allowEmpty = false,
  }: FetchJsonOptions<T> = {},
): Promise<T> {
  const response = await fetch(input, {
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

  try {
    const text = await response.text();

    if (!text) {
      if (allowEmpty || fallbackValue !== undefined) {
        return fallbackValue as T;
      }

      throw new ApiError(response.status, response.statusText, errorMessage ?? 'Empty response body');
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }

    throw new ApiError(response.status, response.statusText, errorMessage ?? 'Failed to parse response JSON');
  }
}
