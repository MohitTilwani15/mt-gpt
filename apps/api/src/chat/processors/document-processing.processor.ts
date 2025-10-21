import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProcessErrorArgs, ServiceBusClient, ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';

import { FileProcessingJobPayload } from 'src/queue/jobs';
import {
  DOCUMENT_PROCESSING_QUEUE,
  SERVICE_BUS_CLIENT,
  SERVICE_BUS_QUEUE_NAMES,
  ServiceBusQueueNames,
} from 'src/queue/queue.constants';
import { PROCESS_DOCUMENT_JOB } from 'src/queue/job.constants';
import { DocumentProcessingService } from '../services/document-processing.service';

@Injectable()
export class DocumentProcessingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentProcessingProcessor.name);
  private receiver: ServiceBusReceiver | null = null;
  private subscription: { close: () => Promise<void> } | null = null;

  constructor(
    @Inject(SERVICE_BUS_CLIENT) private readonly serviceBusClient: ServiceBusClient,
    @Inject(SERVICE_BUS_QUEUE_NAMES) private readonly queueNames: ServiceBusQueueNames,
    private readonly documentProcessingService: DocumentProcessingService,
  ) {}

  async onModuleInit() {
    this.receiver = this.serviceBusClient.createReceiver(this.queueNames.documentProcessing, {
      receiveMode: 'peekLock',
    });

    this.subscription = this.receiver.subscribe(
      {
        processMessage: async (message: ServiceBusReceivedMessage) => this.handleMessage(message),
        processError: async (args: ProcessErrorArgs) => this.handleError(args),
      },
      {
        autoCompleteMessages: false,
      },
    );
    this.logger.log(`Listening for document processing jobs on ${this.queueNames.documentProcessing}.`);
  }

  async onModuleDestroy() {
    await this.subscription?.close().catch((error) =>
      this.logger.warn(`Failed to close document processing subscription: ${error}`),
    );
    await this.receiver?.close().catch((error) =>
      this.logger.warn(`Failed to close document processing receiver: ${error}`),
    );
  }

  private async handleMessage(message: ServiceBusReceivedMessage) {
    const messageId = message.messageId ?? '(no id)';
    const jobName = (message.applicationProperties?.jobName ?? message.subject) as string | undefined;
    const payload = message.body as FileProcessingJobPayload | undefined;

    if (jobName && jobName !== PROCESS_DOCUMENT_JOB) {
      this.logger.warn(`Ignoring message ${messageId} with unexpected job name ${jobName}.`);
      await this.complete(message);
      return;
    }

    if (!payload) {
      this.logger.warn(`Message ${messageId} missing payload; marking as complete.`);
      await this.complete(message);
      return;
    }

    if (payload.extractText === false) {
      this.logger.debug(`Skipping document ${payload.documentId}; extractText flag is false.`);
      await this.complete(message);
      return;
    }

    try {
      await this.documentProcessingService.processDocument(payload.documentId, payload.tenantId);
      this.logger.verbose(`Document ${payload.documentId} processed successfully (message ${messageId}).`);
      await this.complete(message);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Document processing for ${payload.documentId} failed (message ${messageId}): ${err.message}`,
        err.stack,
      );
      await this.abandon(message);
    }
  }

  private async handleError(args: ProcessErrorArgs) {
    this.logger.error(
      `Service Bus error on ${DOCUMENT_PROCESSING_QUEUE}: ${args.error.message}`,
      args.error.stack,
    );
  }

  private async complete(message: ServiceBusReceivedMessage) {
    try {
      await this.receiver?.completeMessage(message);
    } catch (error) {
      this.logger.warn(`Failed to complete message ${message.messageId ?? '(no id)'}: ${error}`);
    }
  }

  private async abandon(message: ServiceBusReceivedMessage) {
    try {
      await this.receiver?.abandonMessage(message);
    } catch (error) {
      this.logger.warn(`Failed to abandon message ${message.messageId ?? '(no id)'}: ${error}`);
    }
  }
}
