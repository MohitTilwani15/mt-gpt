'use client';

import { FileIcon, DownloadIcon, EyeIcon } from 'lucide-react';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent } from '@workspace/ui/components/card';
import { formatFileSize } from '../lib/utils';

interface MessageDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  text?: string;
  downloadUrl: string;
  createdAt: string;
}

interface DocumentAttachmentsProps {
  documents: MessageDocument[];
  onPreview: (document: MessageDocument) => void;
}

export default function DocumentAttachments({ documents, onPreview }: DocumentAttachmentsProps) {
  if (documents.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">Attached Documents</h4>
      <div className="flex flex-wrap gap-2">
        {documents.map((doc) => (
          <Card key={doc.id} className="flex items-center gap-2 p-2 max-w-xs">
            <CardContent className="flex items-center gap-2 p-0">
              <FileIcon className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.fileName}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPreview(doc)}
                >
                  <EyeIcon className="h-3 w-3" />
                </Button>
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