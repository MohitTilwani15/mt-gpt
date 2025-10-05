import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';

import { FileProcessingJobPayload } from './jobs';
import { DOCUMENT_PROCESSING_QUEUE } from './queue.constants';
import { PROCESS_DOCUMENT_JOB } from './job.constants';

@Injectable()
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);

  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly documentQueue: Queue<FileProcessingJobPayload>,
  ) {}

  async enqueueFileProcessing(payload: FileProcessingJobPayload, options?: JobsOptions) {
    const job = await this.documentQueue.add(PROCESS_DOCUMENT_JOB, payload, options);
    this.logger.debug(`Queued document processing job ${job.id} for document ${payload.documentId}.`);
    return job;
  }
}
