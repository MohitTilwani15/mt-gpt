'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { HistoryIcon, Trash2Icon } from 'lucide-react';
import { useChats } from '@/hooks/use-chat';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';
import { Button } from '@workspace/ui/components/button';
import { deleteChat as deleteChatApi } from '@/hooks/use-chat';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

interface ConversationHistoryProps {
  trigger?: React.ReactNode;
  onChatSelect?: (chatId: string) => void;
}

export default function ConversationHistory({ trigger, onChatSelect }: ConversationHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const { data: chatsData, isLoading, error, mutate } = useChats(50, undefined, undefined, {
    refreshInterval: 0,
  });

  const conversations = chatsData?.chats || [];

  const handleChatSelect = (chatId: string) => {
    if (onChatSelect) {
      onChatSelect(chatId);
    } else {
      router.push(`/chat/${chatId}`);
    }
    setIsOpen(false);
  };

  const openConfirm = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setPendingDeleteId(chatId);
  };

  const confirmDelete = async () => {
    const chatId = pendingDeleteId;
    if (!chatId) return;
    try {
      await deleteChatApi(chatId);
      setPendingDeleteId(null);
      await mutate();
      if (pathname === `/chat/${chatId}`) {
        router.push('/');
      }
    } catch (err) {
      console.error('Delete chat failed', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const defaultTrigger = (
    <Button variant="ghost" size="sm">
      <HistoryIcon className="h-4 w-4" />
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || defaultTrigger}
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Conversation History</SheetTitle>
          <SheetDescription>
            Your recent conversations
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => mutate()} variant="outline" size="sm">
                Retry
              </Button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8">
              <HistoryIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => handleChatSelect(conversation.id)}
                  className="w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm mb-1 truncate">
                        {conversation.title || 'Untitled Conversation'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(conversation.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => openConfirm(e, conversation.id)}
                      className="shrink-0 p-2 rounded hover:bg-muted text-muted-foreground"
                      aria-label="Delete chat"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <Dialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this chat?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the conversation and its messages.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
