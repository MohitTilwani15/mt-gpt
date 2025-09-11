'use client';

import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@workspace/ui/components/ui/shadcn-io/ai/reasoning';

interface MessageReasoningProps {
  isLoading: boolean;
  reasoning: string;
}

export function MessageReasoning({
  isLoading,
  reasoning,
}: MessageReasoningProps) {
  return (
    <Reasoning
      isStreaming={isLoading}
      defaultOpen={true}
      data-testid="message-reasoning"
    >
      <ReasoningTrigger />
      <ReasoningContent>{reasoning}</ReasoningContent>
    </Reasoning>
  );
}
