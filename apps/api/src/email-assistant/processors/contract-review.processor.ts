import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProcessErrorArgs, ServiceBusClient, ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';

import { ContractReviewJobPayload } from 'src/queue/jobs';
import {
  CONTRACT_REVIEW_QUEUE,
  SERVICE_BUS_CLIENT,
  SERVICE_BUS_QUEUE_NAMES,
  ServiceBusQueueNames,
} from 'src/queue/queue.constants';
import { REVIEW_CONTRACT_JOB } from 'src/queue/job.constants';
import { ContractReviewService } from '../services/contract-review.service';
import { JobQueueService } from 'src/queue/job-queue.service';

@Injectable()
export class ContractReviewProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContractReviewProcessor.name);
  private receiver: ServiceBusReceiver | null = null;
  private subscription: { close: () => Promise<void> } | null = null;

  constructor(
    @Inject(SERVICE_BUS_CLIENT) private readonly serviceBusClient: ServiceBusClient,
    @Inject(SERVICE_BUS_QUEUE_NAMES) private readonly queueNames: ServiceBusQueueNames,
    private readonly contractReviewService: ContractReviewService,
    private readonly jobQueueService: JobQueueService,
  ) {}

  async onModuleInit() {
    this.receiver = this.serviceBusClient.createReceiver(this.queueNames.contractReview, {
      receiveMode: 'peekLock',
    });

    this.subscription = this.receiver.subscribe(
      {
        processMessage: async (message: ServiceBusReceivedMessage) => this.handleMessage(message),
        processError: async (args: ProcessErrorArgs) => this.handleError(args),
      },
      { autoCompleteMessages: false },
    );

    this.logger.log(`Listening for contract review jobs on ${this.queueNames.contractReview}.`);
  }

  async onModuleDestroy() {
    await this.subscription?.close().catch((error) =>
      this.logger.warn(`Failed to close contract review subscription: ${error}`),
    );
    await this.receiver?.close().catch((error) =>
      this.logger.warn(`Failed to close contract review receiver: ${error}`),
    );
  }

  private async handleMessage(message: ServiceBusReceivedMessage) {
    const messageId = message.messageId ?? '(no id)';
    const jobName = (message.applicationProperties?.jobName ?? message.subject) as string | undefined;
    const payload = message.body as ContractReviewJobPayload | undefined;

    if (jobName && jobName !== REVIEW_CONTRACT_JOB) {
      this.logger.warn(`Received unexpected job ${jobName} on contract review queue (message ${messageId}).`);
      await this.complete(message);
      return;
    }

    if (!payload) {
      this.logger.warn(`Contract review message ${messageId} missing payload; acknowledging.`);
      await this.complete(message);
      return;
    }

    try {
      const result = await this.contractReviewService.reviewContract(payload);
      if (!result) {
        this.logger.debug(`No contract review result for message ${payload.messageId}; acknowledging.`);
        await this.complete(message);
        return;
      }

      const summaryBody = result.summary.length
        ? result.summary.map((line) => `• ${line}`).join('\n')
        : 'No summary available for this review.';

      await this.jobQueueService.enqueueEmailReply({
        userEmail: 'mohit@alphalink.xyz', // TODO: replace with actual user email
        messageId: payload.messageId,
        threadId: payload.threadId,
        toEmail: 'mohit@alphalink.xyz', // TODO: replace with actual recipient email
        subject: `Review feedback: ${payload.subject}`, // TODO: improve subject
        body: summaryBody,
        attachments: result.attachment ? [result.attachment] : undefined,
      });

      this.logger.verbose(`Contract review message ${messageId} completed for message ${payload.messageId}.`);
      await this.complete(message);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Contract review message ${messageId} failed for message ${payload?.messageId}: ${err.message}`,
        err.stack,
      );
      await this.abandon(message);
    }
  }

  private async handleError(args: ProcessErrorArgs) {
    this.logger.error(`Service Bus error on ${CONTRACT_REVIEW_QUEUE}: ${args.error.message}`, args.error.stack);
  }

  private async complete(message: ServiceBusReceivedMessage) {
    try {
      await this.receiver?.completeMessage(message);
    } catch (error) {
      this.logger.warn(`Failed to complete contract review message ${message.messageId ?? '(no id)'}: ${error}`);
    }
  }

  private async abandon(message: ServiceBusReceivedMessage) {
    try {
      await this.receiver?.abandonMessage(message);
    } catch (error) {
      this.logger.warn(`Failed to abandon contract review message ${message.messageId ?? '(no id)'}: ${error}`);
    }
  }
}
