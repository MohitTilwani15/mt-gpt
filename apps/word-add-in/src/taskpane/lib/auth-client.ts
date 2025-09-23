import { createAuthClient } from "better-auth/react";

import { getApiBaseUrl } from "../utils/api";

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: "/api/auth",
  fetchOptions: {
    credentials: "include",
  },
});
