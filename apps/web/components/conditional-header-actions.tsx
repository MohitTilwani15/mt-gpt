'use client';

import { usePathname } from 'next/navigation';
import ConversationHistory from './conversation-history';

export function ConditionalHeaderActions() {
  const pathname = usePathname();
  
  // Show conversation history on home page and chat pages
  if (pathname === '/' || pathname.startsWith('/chat/')) {
    return <ConversationHistory />;
  }
  
  return null;
}
