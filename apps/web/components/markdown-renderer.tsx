'use client';

import ReactMarkdown from 'react-markdown';
import hardenReactMarkdown from 'harden-react-markdown';

const HardenedMarkdown = hardenReactMarkdown(ReactMarkdown);

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <HardenedMarkdown
        defaultOrigin={typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}
        allowedLinkPrefixes={["https://", "http://"]}
        allowedImagePrefixes={["https://", "http://"]}
      >
        {content}
      </HardenedMarkdown>
    </div>
  );
}