export interface FileProcessingJobPayload {
  documentId: string;
  chatId: string;
  fileKey: string;
  mimeType: string;
  fileName: string;
  extractText: boolean;
  userId?: string;
}
