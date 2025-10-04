import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailAssistantController } from './email-assistant.controller';
import { GmailSyncStateService } from './gmail-sync-state.service';
import { EmailProcessorService } from './email-processor.service';
import { EmailSenderService } from './email-sender.service';
import { EmailAssistantService } from './email-assistant.service';
import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';

@Module({
  imports: [ConfigModule],
  controllers: [EmailAssistantController],
  providers: [
    EmailAssistantQueryService,
    EmailAssistantService,
    GmailSyncStateService,
    EmailProcessorService,
    EmailSenderService,
  ],
  exports: [EmailSenderService],
})
export class EmailAssistantModule {}
