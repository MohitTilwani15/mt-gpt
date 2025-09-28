'use client';

import React, { useState } from 'react';
import { useCopyToClipboard } from 'usehooks-ts';
import { toast } from 'sonner';
import { UIMessage, ChatStatus } from 'ai';
import {
  CopyIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  RefreshCwIcon,
  GitForkIcon,
} from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { updateVote } from '../hooks';
import { resolveApiUrl } from '../lib/http';

export interface MessageActionsProps {
  chatId: string;
  message: UIMessage;
  vote?: { isUpvoted: boolean } | null;
  isLoading?: boolean;
  status?: ChatStatus;
  onRegenerate?: () => Promise<void> | void;
  onNavigate?: (path: string) => void;
  className?: string;
  enableVoting?: boolean;
  enableFork?: boolean;
}

export function MessageActions({
  chatId,
  message,
  vote,
  isLoading = false,
  status,
  onRegenerate,
  onNavigate,
  className = '',
  enableVoting = true,
  enableFork = true,
}: MessageActionsProps) {
  const [_, copyToClipboard] = useCopyToClipboard();
  const [isVoting, setIsVoting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isForking, setIsForking] = useState(false);

  if (isLoading) {
    return null;
  }

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
    if (!enableVoting || isVoting) return;

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
    if (!enableFork || isForking || message.role !== 'assistant') {
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
      onNavigate?.(`/chat/${newChatId}`);
    } catch (error) {
      console.error('Fork chat failed', error);
      toast.error('Failed to fork chat');
    } finally {
      setIsForking(false);
    }
  };

  const showRegenerate = onRegenerate && status !== 'streaming' && message.role === 'assistant';
  const showVoteButtons = enableVoting && message.role === 'assistant';
  const showForkButton = enableFork && message.role === 'assistant';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleCopy}
        title={message.role === 'user' ? 'Copy your message' : 'Copy'}
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

export const MemoizedMessageActions = React.memo<MessageActionsProps>(
  MessageActions,
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.vote?.isUpvoted === nextProps.vote?.isUpvoted &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.status === nextProps.status
    );
  }
);
