const getEnvApiBase = (): string => {
  if (typeof process !== "undefined" && process?.env) {
    const fromEnv = process.env.WORD_ADDIN_API_URL || process.env.NEXT_PUBLIC_API_URL || "";
    return typeof fromEnv === "string" ? fromEnv.trim() : "";
  }

  return "";
};

const normalizeBase = (value: string) => value.replace(/\/$/, "");

const DEFAULT_API_BASE = "https://mt-gpt-production.up.railway.app";

export const getApiBaseUrl = (): string => {
  const envApiBase = getEnvApiBase();
  if (envApiBase) {
    return normalizeBase(envApiBase);
  }

  if (DEFAULT_API_BASE) {
    return normalizeBase(DEFAULT_API_BASE);
  }

  if (typeof window !== "undefined" && window.location) {
    return normalizeBase(window.location.origin);
  }

  return "";
};

export const getApiUrl = (path: string): string => {
  const base = getApiBaseUrl();
  if (!base) {
    return path.startsWith("/") ? path : `/${path}`;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};
