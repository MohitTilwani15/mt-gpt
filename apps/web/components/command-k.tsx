"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@workspace/ui/components/command";
import { PlusIcon, MessageSquareIcon } from "lucide-react";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { createChat, useChats } from "@/hooks/use-chat";

export default function CommandK() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: chatsData, isLoading: isLoadingChats } = useChats(
    5,
    undefined,
    undefined,
    { refreshInterval: 0 },
    { enabled: open },
  );
  const chats = chatsData?.chats ?? [];
  const showChatSkeleton = open && isLoadingChats && !chatsData;
  const [query, setQuery] = useState("");
  const [msgResults, setMsgResults] = useState<Array<{ chatId: string; title: string | null; snippet: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setMsgResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/chat/search?q=${encodeURIComponent(q)}&limit=8`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setMsgResults((data.results || []).map((r: any) => ({ chatId: r.chatId, title: r.title, snippet: r.snippet })));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const onNewChat = async () => {
    const id = uuidv4();
    try {
      await createChat({ id });
      setOpen(false);
      router.push(`/chat/${id}`);
    } catch (err) {
      console.error("Failed to create chat", err);
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command" description="Create or search chats" showCloseButton>
      <CommandInput placeholder="Type to search chats or messages…" onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={onNewChat} value="new chat create">
            <PlusIcon className="mr-2 h-4 w-4" />
            <span>Create new chat</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {query.trim().length >= 2 && (
          <CommandGroup heading={loading ? "Searching messages…" : "Message matches"}>
            {msgResults.map((m) => (
              <CommandItem
                key={`msg-${m.chatId}-${m.snippet}`}
                value={`${m.title ?? 'Untitled'} ${m.snippet ?? ''}`}
                onSelect={() => {
                  setOpen(false);
                  router.push(`/chat/${m.chatId}`);
                }}
              >
                <span className="truncate">
                  {m.title || 'Untitled Conversation'}
                  {m.snippet ? <span className="text-muted-foreground"> — {m.snippet.slice(0, 80)}</span> : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Chats">
          {showChatSkeleton ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={`chat-skeleton-${index}`} className="px-2 py-2">
                <Skeleton className="h-6 w-full" />
              </div>
            ))
          ) : (
            chats.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.title ?? "Untitled"} ${c.id}`}
                onSelect={() => {
                  setOpen(false);
                  router.push(`/chat/${c.id}`);
                }}
              >
                <MessageSquareIcon className="mr-2 h-4 w-4" />
                <span className="truncate">{c.title || "Untitled Conversation"}</span>
              </CommandItem>
            ))
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
