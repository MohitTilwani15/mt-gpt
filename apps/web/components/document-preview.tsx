'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet';
import type { MessageDocument } from '@/types/chat';

interface DocumentPreviewProps {
  document: MessageDocument | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function DocumentPreview({ document, isOpen, onClose }: DocumentPreviewProps) {
  if (!document) return null;

  const mimeType = document.mimeType ?? '';
  const isPdf = mimeType === 'application/pdf';
  const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isPlainText = mimeType.startsWith('text/');

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:w-4/5 sm:max-w-4xl h-full flex flex-col">
        <SheetHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg">
              {document.fileName || 'Document Preview'}
            </SheetTitle>
            {document.fileSize && (
              <span className="text-sm text-muted-foreground">
                ({(document.fileSize / 1024 / 1024).toFixed(1)} MB)
              </span>
            )}
          </div>
        </SheetHeader>
        
        <div className="flex-1 overflow-auto p-4">
          {isPdf && (
            <div className="h-full">
              <embed
                src={document.downloadUrl}
                className="w-full h-full border-0 rounded-lg"
                title={document.fileName || 'PDF Preview'}
              />
            </div>
          )}

          {isDocx && (
            <div className="h-full">
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(document.downloadUrl)}`}
                className="w-full h-full border-0 rounded-lg"
                title={document.fileName || 'DOCX Preview'}
              />
            </div>
          )}

          {isPlainText && document.text && (
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
              {document.text}
            </pre>
          )}

          {!isPdf && !isDocx && !isPlainText && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Preview is not available for this file type.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
