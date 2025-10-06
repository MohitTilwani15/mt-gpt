import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailAssistantController } from './email-assistant.controller';
import { GmailSyncStateService } from './gmail-sync-state.service';
import { EmailProcessorService } from './email-processor.service';
import { EmailSenderService } from './email-sender.service';
import { EmailAssistantService } from './email-assistant.service';
import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';
import { DatabaseModule } from 'src/database/database.module';
import { EmailReplyProcessor } from './processors/email-reply.processor';
import { QueueModule } from 'src/queue/queue.module';
import { ContractReviewService } from './contract-review.service';
import { ContractReviewProcessor } from './processors/contract-review.processor';
import { GmailAuthService } from './gmail-auth.service';
import { GmailHistoryService } from './gmail-history.service';
import { GmailMessageParserService } from './gmail-message-parser.service';

@Module({
  imports: [DatabaseModule, ConfigModule, QueueModule],
  controllers: [EmailAssistantController],
  providers: [
    EmailAssistantQueryService,
    EmailAssistantService,
    GmailSyncStateService,
    EmailProcessorService,
    EmailSenderService,
    EmailReplyProcessor,
    ContractReviewService,
    ContractReviewProcessor,
    GmailAuthService,
    GmailHistoryService,
    GmailMessageParserService,
  ],
  exports: [EmailSenderService],
})
export class EmailAssistantModule {}
