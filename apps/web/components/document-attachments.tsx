'use client';

import { EyeIcon, FileIcon } from 'lucide-react';
import { UIMessage } from 'ai';

import { Button } from '@workspace/ui/components/button';
import { Card, CardContent } from '@workspace/ui/components/card';
import { formatFileSize } from '@/lib/utils';
import type { MessageDocument } from '@/types/chat';

interface DocumentAttachmentsProps {
  message: UIMessage;
  onPreview: (document: MessageDocument) => void;
}

type MessagePart = UIMessage['parts'][number];

type FilePart = Extract<MessagePart, { type: 'file' }> & {
  url: string;
  filename?: string;
  fileSize?: number;
  mediaType?: string;
  providerMetadata?: { file?: { id?: string } };
};

const isFilePart = (part: MessagePart): part is FilePart => part.type === 'file' && 'url' in part;

const buildDocumentList = (message: UIMessage): MessageDocument[] => {
  return message.parts
    .filter(isFilePart)
    .map((filePart, index) => ({
      id: filePart.providerMetadata?.file?.id || `${message.id}-file-${index}`,
      fileName: filePart.filename,
      fileSize: filePart.fileSize,
      mimeType: filePart.mediaType,
      downloadUrl: filePart.url,
    }));
};

const getDocumentMeta = (document: MessageDocument): string => {
  if (document.fileSize && document.fileSize > 0) {
    return formatFileSize(document.fileSize);
  }

  if (document.mimeType) {
    const [, subtype] = document.mimeType.split('/');
    return subtype ? subtype.toUpperCase() : document.mimeType;
  }

  return 'Unknown file type';
};

export default function DocumentAttachments({ message, onPreview }: DocumentAttachmentsProps) {
  const documents = buildDocumentList(message);

  if (documents.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex items-center gap-2 p-2 max-w-xs">
            <CardContent className="flex items-center gap-2 p-0">
              <FileIcon className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {doc.fileName || 'Attachment'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getDocumentMeta(doc)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPreview(doc)}
                >
                  <EyeIcon className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
