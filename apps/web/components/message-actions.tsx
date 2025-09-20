'use client';

import { useCopyToClipboard } from 'usehooks-ts';
import { useState } from 'react';
import { toast } from 'sonner';
import { UIMessage, ChatStatus } from 'ai';
import { CopyIcon, ThumbsUpIcon, ThumbsDownIcon, RefreshCwIcon, GitForkIcon } from 'lucide-react';
import { Button } from '@workspace/ui/components/button';
import { updateVote } from '@/hooks/use-votes';
import { useRouter } from 'next/navigation';
import { resolveApiUrl } from '@/lib/http';

interface MessageActionsProps {
  chatId: string;
  message: UIMessage;
  vote?: { isUpvoted: boolean } | null;
  isLoading?: boolean;
  status?: ChatStatus;
  onRegenerate?: () => void;
  className?: string;
}

export function MessageActions({
  chatId,
  message,
  vote,
  isLoading = false,
  status,
  onRegenerate,
  className = '',
}: MessageActionsProps) {
  const router = useRouter();
  const [_, copyToClipboard] = useCopyToClipboard();
  const [isVoting, setIsVoting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isForking, setIsForking] = useState(false);

  // Don't show actions while loading
  if (isLoading) {
    return null;
  }

  // Extract text from message parts
  const textFromParts = message.parts
    ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();

  const handleCopy = async () => {
    if (!textFromParts) {
      toast.error("There's no text to copy!");
      return;
    }

    try {
      await copyToClipboard(textFromParts);
      toast.success('Copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleVote = async (type: 'up' | 'down') => {
    if (isVoting) return;

    setIsVoting(true);
    
    try {
      await updateVote({
        chatId,
        messageId: message.id,
        type,
      });

      toast.success(type === 'up' ? 'Upvoted!' : 'Downvoted!');
    } catch (error) {
      toast.error('Failed to vote');
    } finally {
      setIsVoting(false);
    }
  };

  const handleRegenerate = async () => {
    if (isRegenerating || !onRegenerate) return;

    setIsRegenerating(true);
    
    try {
      await onRegenerate();
      toast.success('Regenerating response...');
    } catch (error) {
      toast.error('Failed to regenerate response');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleFork = async () => {
    if (isForking || message.role !== 'assistant') {
      return;
    }

    setIsForking(true);

    try {
      const response = await fetch(resolveApiUrl(`/api/chat/${chatId}/fork`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ messageId: message.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to fork chat');
      }

      const data = await response.json();
      const newChatId = data?.id;

      if (!newChatId) {
        throw new Error('Fork chat did not return an id');
      }

      toast.success('Forked chat created');
      router.push(`/chat/${newChatId}`);
    } catch (error) {
      console.error('Fork chat failed', error);
      toast.error('Failed to fork chat');
    } finally {
      setIsForking(false);
    }
  };

  const showRegenerate = onRegenerate && status !== 'streaming' && message.role === 'assistant';

  const showVoteButtons = message.role === 'assistant';
  const showForkButton = message.role === 'assistant';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleCopy}
        title={message.role === 'user' ? "Copy your message" : "Copy"}
      >
        <CopyIcon className="h-4 w-4" />
      </Button>

      {showRegenerate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          title="Regenerate"
        >
          <RefreshCwIcon className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
        </Button>
      )}

      {showForkButton && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleFork}
          disabled={isForking}
          title="Fork"
        >
          <GitForkIcon className={`h-4 w-4 ${isForking ? 'animate-pulse' : ''}`} />
        </Button>
      )}

      {showVoteButtons && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleVote('up')}
            disabled={isVoting || vote?.isUpvoted}
            title={vote?.isUpvoted ? 'Already upvoted' : 'Upvote'}
          >
            <ThumbsUpIcon className={`h-4 w-4 ${vote?.isUpvoted ? 'fill-current text-green-500' : ''}`} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleVote('down')}
            disabled={isVoting || !!(vote && !vote.isUpvoted)}
            title={vote && !vote.isUpvoted ? 'Already downvoted' : 'Downvote'}
          >
            <ThumbsDownIcon className={`h-4 w-4 ${vote && !vote.isUpvoted ? 'fill-current text-red-500' : ''}`} />
          </Button>
        </>
      )}
    </div>
  );
}
