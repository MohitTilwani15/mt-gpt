export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';
export const EMAIL_REPLY_QUEUE = 'email-reply';
export const CONTRACT_REVIEW_QUEUE = 'contract-review';

export const SERVICE_BUS_CLIENT = Symbol('SERVICE_BUS_CLIENT');
export const SERVICE_BUS_QUEUE_NAMES = Symbol('SERVICE_BUS_QUEUE_NAMES');

export interface ServiceBusQueueNames {
  documentProcessing: string;
  emailReply: string;
  contractReview: string;
}
