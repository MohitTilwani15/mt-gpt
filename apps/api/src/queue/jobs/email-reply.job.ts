export interface EmailReplyJobPayload {
  userEmail: string;
  messageId: string;
  threadId?: string | null;
  toEmail: string;
  subject: string;
  body: string;
}
