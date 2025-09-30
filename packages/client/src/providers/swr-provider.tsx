'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';

import { resolveApiUrl } from '../lib/http';

export interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
        dedupingInterval: 60_000,
        errorRetryCount: 0,
        refreshInterval: 0,
        fetcher: (url: string) =>
          fetch(resolveApiUrl(url), {
            credentials: 'include',
          }).then((res) => {
            if (!res.ok) {
              throw new Error('Failed to fetch');
            }
            return res.json();
          }),
      }}
    >
      {children}
    </SWRConfig>
  );
}

export default SWRProvider;
