import { OnQueueEvent, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { FileProcessingJobPayload } from 'src/queue/jobs';
import { DOCUMENT_PROCESSING_QUEUE } from 'src/queue/queue.constants';
import { PROCESS_DOCUMENT_JOB } from 'src/queue/job.constants';
import { DocumentProcessingService } from '../services/document-processing.service';

@Processor(DOCUMENT_PROCESSING_QUEUE)
@Injectable()
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingProcessor.name);

  constructor(private readonly documentProcessingService: DocumentProcessingService) {
    super();
  }

  async process(job: Job<FileProcessingJobPayload>) {
    if (!job.data.extractText) {
      this.logger.debug(`Skipping document ${job.data.documentId}; extractText flag is false.`);
      return;
    }

    await this.documentProcessingService.processDocument(job.data.documentId);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<FileProcessingJobPayload>) {
    if (job.name === PROCESS_DOCUMENT_JOB) {
      this.logger.verbose(`Document ${job.data.documentId} processed successfully (job ${job.id}).`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<FileProcessingJobPayload>, error: Error) {
    if (job?.name === PROCESS_DOCUMENT_JOB) {
      this.logger.error(
        `Document processing job ${job.id ?? 'unknown'} failed: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnQueueEvent('waiting')
  onWaiting({ jobId }: { jobId: string }) {
    this.logger.debug(`Document processing job ${jobId} queued.`);
  }
}
