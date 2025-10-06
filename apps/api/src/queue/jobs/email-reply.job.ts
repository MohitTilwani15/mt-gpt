export interface EmailReplyJobPayload {
  userEmail: string;
  messageId: string;
  threadId?: string | null;
  toEmail: string;
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    data: string; // base64 encoded
  }>;
}
