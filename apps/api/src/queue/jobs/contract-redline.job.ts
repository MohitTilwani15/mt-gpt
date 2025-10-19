export type ContractRedlineOperation =
  | {
      type: 'delete';
      text: string;
      rationale?: string;
    }
  | {
      type: 'insert';
      anchor: string;
      text: string;
      rationale?: string;
    };

export interface ContractRedlineJobPayload {
  messageId: string;
  contractType: string;
  operations: ContractRedlineOperation[];
  summary: string[];
  metadata?: {
    subject?: string | null;
    threadId?: string | null;
  };
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType?: string | null;
  }>;
  sourceDocument?: {
    filename: string;
    mimeType?: string | null;
    data: string; // base64 encoded original attachment content
  };
  email: {
    userEmail: string;
    toEmail: string;
    subject: string;
    threadId?: string | null;
  };
}
