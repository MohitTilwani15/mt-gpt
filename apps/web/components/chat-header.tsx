'use client';

import type { ReactNode } from 'react';
import { Button } from '@workspace/ui/components/button';
import { ArrowLeftIcon } from 'lucide-react';

interface ChatHeaderProps {
  title: ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
  children?: ReactNode;
}

export default function ChatHeader({ 
  title, 
  showBackButton = false, 
  onBack, 
  children 
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center gap-4">
        {showBackButton && (
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeftIcon size={16} />
            Back
          </Button>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      
      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}
