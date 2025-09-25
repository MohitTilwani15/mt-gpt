'use client';

import { XIcon, FileIcon } from 'lucide-react';
import { Button } from '@workspace/ui/components/button';
import { formatFileSize } from '@workspace/utils';

export interface AttachmentFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
}

export interface TextInputAttachmentsProps {
  files: AttachmentFile[];
  onRemoveFile: (fileId: string) => void;
}

export function TextInputAttachments({ files, onRemoveFile }: TextInputAttachmentsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-background">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border max-w-xs"
        >
          <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{file.fileName}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.fileSize)}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemoveFile(file.id)}
            className="h-6 w-6 p-0 flex-shrink-0"
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export default TextInputAttachments;
