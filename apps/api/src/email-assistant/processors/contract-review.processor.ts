import { Processor, WorkerHost, OnWorkerEvent, OnQueueEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { ContractReviewJobPayload } from 'src/queue/jobs';
import { CONTRACT_REVIEW_QUEUE } from 'src/queue/queue.constants';
import { REVIEW_CONTRACT_JOB } from 'src/queue/job.constants';
import { ContractReviewService } from '../services/contract-review.service';
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

    const summaryBody = result.summary.length
      ? result.summary.map((line) => `• ${line}`).join('\n')
      : 'No summary available for this review.';

    await this.jobQueueService.enqueueEmailReply({
      userEmail: 'mohit@alphalink.xyz', // TODO: replace with actual user email
      messageId: job.data.messageId,
      threadId: job.data.threadId,
      toEmail: 'mohit@alphalink.xyz', // TODO: replace with actual recipient email
      subject: `Review feedback: ${job.data.subject}`, // TODO: improve subject
      body: summaryBody,
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
