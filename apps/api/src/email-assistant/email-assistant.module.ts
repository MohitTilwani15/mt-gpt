import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailAssistantController } from './email-assistant.controller';
import { ContractTemplateController } from './controllers/contract-template.controller';
import { ContractPlaybookController } from './controllers/contract-playbook.controller';
import { GmailSyncStateService } from './services/gmail/gmail-sync-state.service';
import { EmailProcessorService } from './services/email-processor.service';
import { EmailSenderService } from './services/email-sender.service';
import { EmailAssistantService } from './services/email-assistant.service';
import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';
import { ContractTemplateQueryService } from 'src/database/queries/contract-template.query';
import { ContractPlaybookQueryService } from 'src/database/queries/contract-playbook.query';
import { DatabaseModule } from 'src/database/database.module';
import { EmailReplyProcessor } from './processors/email-reply.processor';
import { QueueModule } from 'src/queue/queue.module';
import { ContractReviewService } from './services/contract-review.service';
import { ContractReviewProcessor } from './processors/contract-review.processor';
import { GmailAuthService } from './services/gmail/gmail-auth.service';
import { GmailHistoryService } from './services/gmail/gmail-history.service';
import { GmailMessageParserService } from './services/gmail/gmail-message-parser.service';
import { ContractTextExtractionService } from './services/contract-text-extraction.service';
import { LlmContractReviewService } from './services/llm-contract-review.service';
import { ContractTemplateService } from './services/contract-template.service';
import { ContractPlaybookService } from './services/contract-playbook.service';
import { CloudflareR2Service } from 'src/services/cloudflare-r2.service';
import { DocxRedlineService } from './services/docx-redline.service';

@Module({
  imports: [DatabaseModule, ConfigModule, QueueModule],
  controllers: [EmailAssistantController, ContractTemplateController, ContractPlaybookController],
  providers: [
    EmailAssistantQueryService,
    ContractTemplateQueryService,
    ContractPlaybookQueryService,
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
    ContractTextExtractionService,
    LlmContractReviewService,
    ContractTemplateService,
    ContractPlaybookService,
    CloudflareR2Service,
    DocxRedlineService,
  ],
  exports: [EmailSenderService, ContractPlaybookService],
})
export class EmailAssistantModule {}
