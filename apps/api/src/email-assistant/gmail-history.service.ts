import { Injectable } from '@nestjs/common';
import type { gmail_v1 } from '@googleapis/gmail';

interface HistoryFetchResult {
  historyEntries: gmail_v1.Schema$History[];
  lastHistoryIdUsed: string;
  responseHistoryId: string | null;
}

@Injectable()
export class GmailHistoryService {
  async fetchHistory(params: {
    gmailClient: gmail_v1.Gmail;
    historyId: string;
    lastStoredHistoryId: string | null;
  }): Promise<HistoryFetchResult> {
    const { gmailClient, historyId, lastStoredHistoryId } = params;
    const startHistoryId = lastStoredHistoryId ?? historyId;

    const historyRes = await gmailClient.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    });

    return {
      historyEntries: historyRes.data.history ?? [],
      lastHistoryIdUsed: startHistoryId,
      responseHistoryId: historyRes.data.historyId ?? null,
    };
  }
}
