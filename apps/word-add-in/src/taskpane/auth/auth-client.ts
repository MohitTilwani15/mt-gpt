import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.WORD_ADDIN_API_URL,
  basePath: "/api/auth",
  fetchOptions: {
    credentials: "include",
  },
});
