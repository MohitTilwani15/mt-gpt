'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  ConversationHistory as ConversationHistoryBase,
  type ConversationHistoryProps,
} from '@workspace/client';

export default function ConversationHistory(props: ConversationHistoryProps) {
  const router = useRouter();
  const pathname = usePathname();

  const derivedActiveChatId = useMemo(() => {
    if (props.activeChatId) {
      return props.activeChatId;
    }

    if (!pathname || !pathname.startsWith('/chat/')) {
      return undefined;
    }

    const [, , chatId] = pathname.split('/');
    return chatId || undefined;
  }, [pathname, props.activeChatId]);

  const handleChatSelect = (chatId: string) => {
    props.onChatSelect?.(chatId);

    if (!props.onChatSelect) {
      router.push(`/chat/${chatId}`);
    }
  };

  const handleActiveChatClosed = () => {
    props.onActiveChatClosed?.();

    if (!props.onActiveChatClosed) {
      router.push('/');
    }
  };

  return (
    <ConversationHistoryBase
      {...props}
      activeChatId={derivedActiveChatId}
      onChatSelect={handleChatSelect}
      onActiveChatClosed={handleActiveChatClosed}
    />
  );
}
