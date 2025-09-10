'use client';

import { FileIcon, DownloadIcon, EyeIcon } from 'lucide-react';
import { UIMessage } from 'ai';
import mime from 'mime-types';

import { Button } from '@workspace/ui/components/button';
import { Card, CardContent } from '@workspace/ui/components/card';

interface MessageDocument {
  id: string;
  fileName?: string;
  fileSize?: number;
  mimeType: string;
  text?: string;
  downloadUrl: string;
}

interface DocumentAttachmentsProps {
  message: UIMessage;
  onPreview: (document: MessageDocument) => void;
}

export default function DocumentAttachments({ message, onPreview }: DocumentAttachmentsProps) {
  const fileParts = message.parts.filter(part => part.type === 'file');
  
  if (fileParts.length === 0) return null;

  const documents: MessageDocument[] = fileParts.map((part, index) => {
    const filePart = part as any;
    return {
      id: filePart.providerMetadata?.file?.id || `${message.id}-file-${index}`,
      fileName: filePart.filename,
      fileSize: filePart.fileSize,
      mimeType: filePart.mediaType,
      downloadUrl: filePart.url,
    };
  });

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex items-center gap-2 p-2 max-w-xs">
            <CardContent className="flex items-center gap-2 p-0">
              <FileIcon className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {doc.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {doc.fileSize ? `${(doc.fileSize / 1024 / 1024).toFixed(1)} MB` : mime.extension(doc.mimeType)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {/* <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPreview(doc)}
                >
                  <EyeIcon className="h-3 w-3" />
                </Button> */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(doc.downloadUrl, '_blank')}
                >
                  <DownloadIcon className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}