import { createAuthClient } from 'better-auth/react';

import { resolveApiUrl } from '@/lib/http';

export const authClient = createAuthClient({
  baseURL: resolveApiUrl('/api/auth'),
});
