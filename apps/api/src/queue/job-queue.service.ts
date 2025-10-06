import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';

import { FileProcessingJobPayload, EmailReplyJobPayload, ContractReviewJobPayload } from './jobs';
import { CONTRACT_REVIEW_QUEUE, DOCUMENT_PROCESSING_QUEUE, EMAIL_REPLY_QUEUE } from './queue.constants';
import { PROCESS_DOCUMENT_JOB, REVIEW_CONTRACT_JOB, SEND_EMAIL_REPLY_JOB } from './job.constants';

@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);

  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE) private readonly documentQueue: Queue<FileProcessingJobPayload>,
    @InjectQueue(EMAIL_REPLY_QUEUE) private readonly emailReplyQueue: Queue<EmailReplyJobPayload>,
    @InjectQueue(CONTRACT_REVIEW_QUEUE) private readonly contractReviewQueue: Queue<ContractReviewJobPayload>,
  ) {}

  async enqueueFileProcessing(payload: FileProcessingJobPayload, options?: JobsOptions) {
    const job = await this.documentQueue.add(PROCESS_DOCUMENT_JOB, payload, options);
    this.logger.debug(`Queued document processing job ${job.id} for document ${payload.documentId}.`);
    return job;
  }

  async enqueueEmailReply(payload: EmailReplyJobPayload, options?: JobsOptions) {
    const job = await this.emailReplyQueue.add(SEND_EMAIL_REPLY_JOB, payload, options);
    this.logger.debug(`Queued email reply job ${job.id} for message ${payload.messageId}.`);
    return job;
  }

  async enqueueContractReview(payload: ContractReviewJobPayload, options?: JobsOptions) {
    const job = await this.contractReviewQueue.add(REVIEW_CONTRACT_JOB, payload, options);
    this.logger.debug(`Queued contract review job ${job.id} for message ${payload.messageId}.`);
    return job;
  }
}
