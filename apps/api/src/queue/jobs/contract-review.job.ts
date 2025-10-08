export interface ContractReviewJobPayload {
  messageId: string;
  userEmail: string;
  senderEmail: string;
  subject: string;
  threadId?: string | null;
}
