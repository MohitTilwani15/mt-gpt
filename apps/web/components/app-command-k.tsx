'use client';

import { useRouter } from 'next/navigation';

import { CommandK } from '@workspace/client/components';

export function AppCommandK() {
  const router = useRouter();

  return <CommandK onNavigate={(path) => router.push(path)} />;
}
