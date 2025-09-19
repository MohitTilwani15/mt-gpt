export interface MessageDocument {
  id: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  text?: string;
  downloadUrl: string;
  createdAt?: string;
}
