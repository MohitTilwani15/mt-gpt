import { Injectable } from '@nestjs/common';
import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';

@Injectable()
export class GmailSyncStateService {
  constructor(private readonly emailAssistantQuery: EmailAssistantQueryService) {}

  async getLastHistoryId(userEmail: string) {
    return this.emailAssistantQuery.getLastHistoryId(userEmail);
  }

  async saveLastHistoryId(userEmail: string, historyId: string) {
    await this.emailAssistantQuery.saveLastHistoryId(userEmail, historyId);
  }
}
