'use client';

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ArchiveIcon, HistoryIcon, MoreVerticalIcon, Share2Icon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@workspace/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@workspace/ui/components/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';
import { Skeleton } from '@workspace/ui/components/skeleton';

import { archiveChat, deleteChat as deleteChatApi, updateChatVisibility, useChats } from '../hooks';

interface Conversation {
  id: string;
  title?: string | null;
  createdAt: string;
  isPublic?: boolean;
}

type TriggerEvent = MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>;

export interface ConversationHistoryProps {
  trigger?: ReactNode;
  activeChatId?: string;
  onChatSelect?: (chatId: string) => void;
  onActiveChatClosed?: () => void;
}

export function ConversationHistory({
  trigger,
  activeChatId,
  onChatSelect,
  onActiveChatClosed,
}: ConversationHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const {
    data: chatsData,
    isLoading,
    error,
    mutate,
  } = useChats(50, undefined, undefined, { refreshInterval: 0 }, { enabled: isOpen });

  const conversations: Conversation[] = chatsData?.chats ?? [];
  const showLoading = isOpen && isLoading;
  const fetchError = isOpen ? error : undefined;
  const showEmpty = isOpen && !isLoading && !fetchError && conversations.length === 0;

  const handleChatSelect = (chatId: string) => {
    onChatSelect?.(chatId);
    setIsOpen(false);
  };

  const openConfirm = (event: TriggerEvent, chatId: string) => {
    event.stopPropagation();
    setPendingDeleteId(chatId);
  };

  const confirmDelete = async () => {
    const chatId = pendingDeleteId;
    if (!chatId) return;

    try {
      await deleteChatApi(chatId);
      setPendingDeleteId(null);
      await mutate();
      if (activeChatId === chatId) {
        onActiveChatClosed?.();
      }
    } catch (err) {
      console.error('Delete chat failed', err);
      toast.error('Failed to delete chat');
    }
  };

  const handleShare = async (conversationId: string, isAlreadyPublic?: boolean) => {
    try {
      if (!isAlreadyPublic) {
        await updateChatVisibility(conversationId, true);
        await mutate();
      }

      const shareUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/chat/${conversationId}`
        : `/chat/${conversationId}`;

      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ url: shareUrl });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Share link copied to clipboard');
      } else {
        toast.success('Share link ready');
      }
    } catch (err) {
      console.error('Share chat failed', err);
      toast.error('Failed to share chat');
    } finally {
      setOpenMenuId(null);
    }
  };

  const handleArchive = async (conversationId: string) => {
    try {
      await archiveChat(conversationId, true);
      await mutate();
      toast.success('Chat archived');
      if (activeChatId === conversationId) {
        onActiveChatClosed?.();
      }
    } catch (err) {
      console.error('Archive chat failed', err);
      toast.error('Failed to archive chat');
    } finally {
      setOpenMenuId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    if (diffInDays === 1) {
      return 'Yesterday';
    }

    if (diffInDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
          <SheetDescription>Your recent conversations</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {showLoading ? (
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={`conversation-skeleton-${index}`} className="p-4 rounded-lg border">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-6 w-6" />
                  </div>
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                {fetchError instanceof Error ? fetchError.message : 'Failed to load conversations'}
              </p>
              <Button onClick={() => mutate()} variant="outline" size="sm">
                Retry
              </Button>
            </div>
          ) : showEmpty ? (
            <div className="text-center py-8">
              <HistoryIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {conversations.map((conversation) => {
                const isMenuOpen = openMenuId === conversation.id;
                return (
                  <div
                    key={conversation.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleChatSelect(conversation.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleChatSelect(conversation.id);
                      }
                    }}
                    className="w-full text-left p-4 rounded-lg border hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                      <Popover
                        open={isMenuOpen}
                        onOpenChange={(open) => setOpenMenuId(open ? conversation.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={(event) => event.stopPropagation()}
                            aria-label="Chat actions"
                          >
                            <MoreVerticalIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-44 p-1"
                          align="end"
                          sideOffset={6}
                          onOpenAutoFocus={(event) => event.preventDefault()}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleShare(conversation.id, conversation.isPublic);
                            }}
                          >
                            <Share2Icon className="h-4 w-4" />
                            Share
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleArchive(conversation.id);
                            }}
                          >
                            <ArchiveIcon className="h-4 w-4" />
                            Archive
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenMenuId(null);
                              openConfirm(event, conversation.id);
                            }}
                          >
                            <Trash2Icon className="h-4 w-4" />
                            Delete
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                );
              })}
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

export default ConversationHistory;
