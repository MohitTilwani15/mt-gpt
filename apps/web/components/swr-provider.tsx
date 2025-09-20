'use client';

import { SWRConfig } from 'swr';

import { resolveApiUrl } from '@/lib/http';

export default function SWRProvider({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
        dedupingInterval: 60000,
        errorRetryCount: 0,
        refreshInterval: 0,
        fetcher: (url: string) => fetch(resolveApiUrl(url), {
          credentials: 'include',
        }).then(res => {
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
