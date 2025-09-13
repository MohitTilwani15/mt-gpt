'use client';

import { usePathname } from 'next/navigation';
import ConversationHistory from './conversation-history';

export function ConditionalHeaderActions() {
  const pathname = usePathname();
  
  if (pathname === '/' || pathname.startsWith('/chat/')) {
    return <ConversationHistory />;
  }
  
  return null;
}
