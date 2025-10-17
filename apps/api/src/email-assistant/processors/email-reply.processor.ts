import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProcessErrorArgs, ServiceBusClient, ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';

import { EmailReplyJobPayload } from 'src/queue/jobs';
import {
  EMAIL_REPLY_QUEUE,
  SERVICE_BUS_CLIENT,
  SERVICE_BUS_QUEUE_NAMES,
  ServiceBusQueueNames,
} from 'src/queue/queue.constants';
import { SEND_EMAIL_REPLY_JOB } from 'src/queue/job.constants';
import { EmailSenderService } from '../services/email-sender.service';

@Injectable()
export class EmailReplyProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailReplyProcessor.name);
  private receiver: ServiceBusReceiver | null = null;
  private subscription: { close: () => Promise<void> } | null = null;

  constructor(
    @Inject(SERVICE_BUS_CLIENT) private readonly serviceBusClient: ServiceBusClient,
    @Inject(SERVICE_BUS_QUEUE_NAMES) private readonly queueNames: ServiceBusQueueNames,
    private readonly emailSender: EmailSenderService,
  ) {}

  async onModuleInit() {
    this.receiver = this.serviceBusClient.createReceiver(this.queueNames.emailReply, {
      receiveMode: 'peekLock',
    });

    this.subscription = this.receiver.subscribe(
      {
        processMessage: async (message: ServiceBusReceivedMessage) => this.handleMessage(message),
        processError: async (args: ProcessErrorArgs) => this.handleError(args),
      },
      { autoCompleteMessages: false },
    );

    this.logger.log(`Listening for email reply jobs on ${this.queueNames.emailReply}.`);
  }

  async onModuleDestroy() {
    await this.subscription?.close().catch((error) =>
      this.logger.warn(`Failed to close email reply subscription: ${error}`),
    );
    await this.receiver?.close().catch((error) =>
      this.logger.warn(`Failed to close email reply receiver: ${error}`),
    );
  }

  private async handleMessage(message: ServiceBusReceivedMessage) {
    const messageId = message.messageId ?? '(no id)';
    const jobName = (message.applicationProperties?.jobName ?? message.subject) as string | undefined;
    const payload = message.body as EmailReplyJobPayload | undefined;

    if (jobName && jobName !== SEND_EMAIL_REPLY_JOB) {
      this.logger.warn(`Received unknown job ${jobName} on email reply queue (message ${messageId}).`);
      await this.complete(message);
      return;
    }

    if (!payload) {
      this.logger.warn(`Email reply message ${messageId} missing payload; acknowledging.`);
      await this.complete(message);
      return;
    }

    try {
      await this.emailSender.sendReply({
        userEmail: payload.userEmail,
        toEmail: payload.toEmail,
        subject: payload.subject,
        body: payload.body,
        threadId: payload.threadId,
        attachments: payload.attachments,
      });
      this.logger.verbose(`Email reply message ${messageId} completed for message ${payload.messageId}.`);
      await this.complete(message);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Email reply message ${messageId} failed for message ${payload?.messageId}: ${err.message}`,
        err.stack,
      );
      await this.abandon(message);
    }
  }

  private async handleError(args: ProcessErrorArgs) {
    this.logger.error(`Service Bus error on ${EMAIL_REPLY_QUEUE}: ${args.error.message}`, args.error.stack);
  }

  private async complete(message: ServiceBusReceivedMessage) {
    try {
      await this.receiver?.completeMessage(message);
    } catch (error) {
      this.logger.warn(`Failed to complete email reply message ${message.messageId ?? '(no id)'}: ${error}`);
    }
  }

  private async abandon(message: ServiceBusReceivedMessage) {
    try {
      await this.receiver?.abandonMessage(message);
    } catch (error) {
      this.logger.warn(`Failed to abandon email reply message ${message.messageId ?? '(no id)'}: ${error}`);
    }
  }
}
