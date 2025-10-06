import { Processor, WorkerHost, OnWorkerEvent, OnQueueEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { ContractReviewJobPayload } from 'src/queue/jobs';
import { CONTRACT_REVIEW_QUEUE } from 'src/queue/queue.constants';
import { REVIEW_CONTRACT_JOB } from 'src/queue/job.constants';
import { ContractReviewService } from '../contract-review.service';
import { JobQueueService } from 'src/queue/job-queue.service';

@Processor(CONTRACT_REVIEW_QUEUE)
@Injectable()
export class ContractReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(ContractReviewProcessor.name);

  constructor(
    private readonly contractReviewService: ContractReviewService,
    private readonly jobQueueService: JobQueueService,
  ) {
    super();
  }

  async process(job: Job<ContractReviewJobPayload>) {
    if (job.name !== REVIEW_CONTRACT_JOB) {
      this.logger.warn(`Received unexpected job ${job.name} on contract review queue.`);
      return;
    }

    const result = await this.contractReviewService.reviewContract(job.data);
    if (!result) {
      return;
    }

    await this.jobQueueService.enqueueEmailReply({
      userEmail: job.data.userEmail,
      messageId: job.data.messageId,
      threadId: job.data.threadId,
      toEmail: job.data.senderEmail,
      subject: `Review feedback: ${job.data.subject}`,
      body: result.summary,
      attachments: result.attachment
        ? [result.attachment]
        : undefined,
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ContractReviewJobPayload>) {
    if (job.name === REVIEW_CONTRACT_JOB) {
      this.logger.verbose(`Contract review job ${job.id} completed for message ${job.data.messageId}.`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ContractReviewJobPayload>, error: Error) {
    if (job?.name === REVIEW_CONTRACT_JOB) {
      this.logger.error(
        `Contract review job ${job.id ?? 'unknown'} failed: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnQueueEvent('waiting')
  onWaiting({ jobId }: { jobId: string }) {
    this.logger.debug(`Contract review job ${jobId} queued.`);
  }
}
