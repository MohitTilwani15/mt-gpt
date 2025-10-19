import { ConfigService } from '@nestjs/config';

import {
  CONTRACT_REVIEW_QUEUE,
  CONTRACT_REDLINING_QUEUE,
  DOCUMENT_PROCESSING_QUEUE,
  EMAIL_REPLY_QUEUE,
  ServiceBusQueueNames,
} from './queue.constants';

export interface ServiceBusConfiguration {
  connectionString: string;
  queueNames: ServiceBusQueueNames;
}

export const buildServiceBusConfiguration = (config: ConfigService): ServiceBusConfiguration => {
  const connectionString =
    config.get<string>('AZURE_SERVICE_BUS_CONNECTION_STRING') ??
    config.get<string>('SERVICE_BUS_CONNECTION_STRING');

  if (!connectionString) {
    throw new Error('Missing Azure Service Bus connection string (set AZURE_SERVICE_BUS_CONNECTION_STRING).');
  }

  return {
    connectionString,
    queueNames: {
      documentProcessing:
        config.get<string>('AZURE_SERVICE_BUS_DOCUMENT_QUEUE') ??
        config.get<string>('SERVICE_BUS_DOCUMENT_QUEUE') ??
        DOCUMENT_PROCESSING_QUEUE,
      emailReply:
        config.get<string>('AZURE_SERVICE_BUS_EMAIL_QUEUE') ??
        config.get<string>('SERVICE_BUS_EMAIL_QUEUE') ??
        EMAIL_REPLY_QUEUE,
      contractReview:
        config.get<string>('AZURE_SERVICE_BUS_CONTRACT_QUEUE') ??
        config.get<string>('SERVICE_BUS_CONTRACT_QUEUE') ??
        CONTRACT_REVIEW_QUEUE,
      contractRedlining:
        config.get<string>('AZURE_SERVICE_BUS_REDLINING_QUEUE') ??
        config.get<string>('SERVICE_BUS_REDLINING_QUEUE') ??
        CONTRACT_REDLINING_QUEUE,
    },
  };
};
