import { useState, useCallback } from 'react';

import { resolveApiUrl } from '../lib/http';

export interface UploadedFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
}

export interface FileUploadOptions {
  chatId: string;
  extractText?: boolean;
}

export interface FileUploadResult {
  files: UploadedFile[];
}

export const useFileUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(async (
    files: FileList,
    options: FileUploadOptions
  ): Promise<FileUploadResult> => {
    const formData = new FormData();
    const fileArray = Array.from(files);

    fileArray.forEach((file) => {
      formData.append('files', file);
    });

    formData.append('chatId', options.chatId);
    formData.append('extractText', options.extractText ? 'true' : 'false');

    setIsUploading(true);
    setError(null);

    try {
      const response = await fetch(resolveApiUrl('/api/files/upload'), {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload files';
      setError(errorMessage);
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isUploading,
    error,
    uploadFiles,
    clearError,
  };
};
