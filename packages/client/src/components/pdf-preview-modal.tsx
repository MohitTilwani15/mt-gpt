'use client';

import { useState, useEffect } from 'react';
import { XIcon, FileIcon, DownloadIcon, EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { formatFileSize } from '@workspace/utils';

export interface PreviewDocument {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  text?: string;
  downloadUrl: string;
  createdAt: string;
}

export interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: PreviewDocument | null;
}

export function PDFPreviewModal({ isOpen, onClose, document }: PDFPreviewModalProps) {
  const [showExtractedText, setShowExtractedText] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowExtractedText(false);
    }
  }, [isOpen]);

  if (!isOpen || !document) return null;

  const handleDownload = () => {
    window.open(document.downloadUrl, '_blank');
  };

  const toggleExtractedText = () => {
    setShowExtractedText((prev) => !prev);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileIcon className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold">{document.fileName}</h2>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(document.fileSize)} • {new Date(document.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="flex items-center gap-2"
            >
              <DownloadIcon className="h-4 w-4" />
              Download
            </Button>
            {document.text && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleExtractedText}
                className="flex items-center gap-2"
              >
                {showExtractedText ? (
                  <>
                    <EyeOffIcon className="h-4 w-4" />
                    Hide Text
                  </>
                ) : (
                  <>
                    <EyeIcon className="h-4 w-4" />
                    Show Text
                  </>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {showExtractedText && document.text ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Extracted Text Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm">
                  {document.text}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <iframe
                src={document.downloadUrl}
                className="w-full h-[70vh]"
                title={document.fileName}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PDFPreviewModal;
