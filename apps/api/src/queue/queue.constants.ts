// Queue used by the Nest chat service for OCR/extraction before embeddings.
export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';
// Queue used by the email assistant to asynchronously send outbound replies.
export const EMAIL_REPLY_QUEUE = 'email-reply';
// Queue used to run the LLM contract review pipeline inside Nest.
export const CONTRACT_REVIEW_QUEUE = 'contract-review';
// Queue consumed by the external .NET service to generate DOCX redlines.
export const CONTRACT_REDLINING_QUEUE = 'contract-redlining';

export const SERVICE_BUS_CLIENT = Symbol('SERVICE_BUS_CLIENT');
export const SERVICE_BUS_QUEUE_NAMES = Symbol('SERVICE_BUS_QUEUE_NAMES');

export interface ServiceBusQueueNames {
  documentProcessing: string;
  emailReply: string;
  contractReview: string;
  contractRedlining: string;
}
