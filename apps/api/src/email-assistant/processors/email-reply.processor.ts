import { Processor, WorkerHost, OnQueueEvent, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { EmailReplyJobPayload } from 'src/queue/jobs';
import { EMAIL_REPLY_QUEUE } from 'src/queue/queue.constants';
import { SEND_EMAIL_REPLY_JOB } from 'src/queue/job.constants';
import { EmailSenderService } from '../services/email-sender.service';

@Processor(EMAIL_REPLY_QUEUE)
@Injectable()
export class EmailReplyProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailReplyProcessor.name);

  constructor(private readonly emailSender: EmailSenderService) {
    super();
  }

  async process(job: Job<EmailReplyJobPayload>) {
    if (job.name !== SEND_EMAIL_REPLY_JOB) {
      this.logger.warn(`Received unknown job ${job.name} on email reply queue.`);
      return;
    }

    const { userEmail, body, subject, toEmail, threadId, attachments } = job.data;

    await this.emailSender.sendReply({
      userEmail,
      toEmail,
      subject,
      body,
      threadId,
      attachments,
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<EmailReplyJobPayload>) {
    if (job.name === SEND_EMAIL_REPLY_JOB) {
      this.logger.verbose(`Email reply job ${job.id} completed for message ${job.data.messageId}.`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EmailReplyJobPayload>, error: Error) {
    if (job?.name === SEND_EMAIL_REPLY_JOB) {
      this.logger.error(
        `Email reply job ${job.id ?? 'unknown'} failed: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnQueueEvent('waiting')
  onWaiting({ jobId }: { jobId: string }) {
    this.logger.debug(`Email reply job ${jobId} queued.`);
  }
}
