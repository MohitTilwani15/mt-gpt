import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { randomUUID } from 'crypto';

import { FileProcessingJobPayload, EmailReplyJobPayload, ContractReviewJobPayload } from './jobs';
import {
  CONTRACT_REVIEW_QUEUE,
  DOCUMENT_PROCESSING_QUEUE,
  EMAIL_REPLY_QUEUE,
  SERVICE_BUS_CLIENT,
  SERVICE_BUS_QUEUE_NAMES,
  ServiceBusQueueNames,
} from './queue.constants';
import { PROCESS_DOCUMENT_JOB, REVIEW_CONTRACT_JOB, SEND_EMAIL_REPLY_JOB } from './job.constants';

@Injectable()
export class JobQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly senderCache = new Map<string, ServiceBusSender>();

  constructor(
    @Inject(SERVICE_BUS_CLIENT) private readonly serviceBusClient: ServiceBusClient,
    @Inject(SERVICE_BUS_QUEUE_NAMES) private readonly queueNames: ServiceBusQueueNames,
  ) {}

  async onModuleDestroy() {
    await Promise.all(
      [...this.senderCache.values()].map(async (sender) => {
        try {
          await sender.close();
        } catch (error) {
          this.logger.warn(`Failed to close Service Bus sender for queue ${sender.entityPath}: ${error}`);
        }
      }),
    );
  }

  async enqueueFileProcessing(payload: FileProcessingJobPayload) {
    const messageId = await this.sendMessage(DOCUMENT_PROCESSING_QUEUE, this.queueNames.documentProcessing, {
      jobName: PROCESS_DOCUMENT_JOB,
      payload,
    });
    this.logger.debug(`Queued document processing message ${messageId} for document ${payload.documentId}.`);
    return messageId;
  }

  async enqueueEmailReply(payload: EmailReplyJobPayload) {
    const messageId = await this.sendMessage(EMAIL_REPLY_QUEUE, this.queueNames.emailReply, {
      jobName: SEND_EMAIL_REPLY_JOB,
      payload,
    });
    this.logger.debug(`Queued email reply message ${messageId} for message ${payload.messageId}.`);
    return messageId;
  }

  async enqueueContractReview(payload: ContractReviewJobPayload) {
    const messageId = await this.sendMessage(CONTRACT_REVIEW_QUEUE, this.queueNames.contractReview, {
      jobName: REVIEW_CONTRACT_JOB,
      payload,
    });
    this.logger.debug(`Queued contract review message ${messageId} for message ${payload.messageId}.`);
    return messageId;
  }

  private async sendMessage(
    logicalQueueName: string,
    serviceBusQueueName: string,
    message: { jobName: string; payload: unknown },
  ) {
    const sender = this.getOrCreateSender(serviceBusQueueName);
    const messageId = randomUUID();

    await sender.sendMessages({
      body: message.payload,
      contentType: 'application/json',
      messageId,
      subject: message.jobName,
      applicationProperties: {
        jobName: message.jobName,
        logicalQueue: logicalQueueName,
      },
    });

    return messageId;
  }

  private getOrCreateSender(queueName: string) {
    if (!this.senderCache.has(queueName)) {
      this.senderCache.set(queueName, this.serviceBusClient.createSender(queueName));
    }

    return this.senderCache.get(queueName)!;
  }
}
