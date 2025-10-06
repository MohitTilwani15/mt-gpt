import { Injectable } from '@nestjs/common';
import type { gmail_v1 } from '@googleapis/gmail';

type HistoryMessageAdded = gmail_v1.Schema$HistoryMessageAdded & { message: { id: string } };

@Injectable()
export class GmailMessageParserService {
  extractAddedMessages(historyEntries: gmail_v1.Schema$History[]): HistoryMessageAdded[] {
    return historyEntries
      .flatMap((entry) => entry.messagesAdded ?? [])
      .filter((added): added is HistoryMessageAdded => typeof added.message?.id === 'string');
  }

  extractHeaders(headers: gmail_v1.Schema$MessagePartHeader[] | undefined) {
    const map = new Map<string, string>();

    for (const header of headers ?? []) {
      if (!header.name || !header.value) continue;
      map.set(header.name.toLowerCase(), header.value);
    }

    return map;
  }

  extractEmailAddress(headerValue?: string | null): string | null {
    if (!headerValue) return null;
    const match = headerValue.match(/<([^>]+)>/);
    const email = match ? match[1] : headerValue;
    return email.trim().toLowerCase();
  }

  hasAttachments(parts: gmail_v1.Schema$MessagePart[] | undefined): boolean {
    for (const part of parts ?? []) {
      if (part.filename && part.body?.attachmentId) {
        return true;
      }
      if (part.parts && this.hasAttachments(part.parts)) {
        return true;
      }
    }
    return false;
  }

  getLatestHistoryId(historyEntries: gmail_v1.Schema$History[]) {
    const ids = historyEntries
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string');

    if (!ids.length) return null;

    return ids.reduce((maxId, current) => {
      try {
        return BigInt(current) > BigInt(maxId) ? current : maxId;
      } catch {
        return current;
      }
    }, ids[0]);
  }
}

export type { HistoryMessageAdded };
