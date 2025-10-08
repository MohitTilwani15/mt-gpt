import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from 'src/database/database-connection';
import { databaseSchema } from 'src/database/schemas';

const { gmailSyncState, emailMessages, emailAttachments } = databaseSchema;

interface EmailAttachmentRecord {
  filename: string | null;
  mimeType: string | null;
  data: string;
}

export interface SaveInboundMessageParams {
  id: string;
  threadId?: string | null;
  fromEmail?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  snippet?: string | null;
  body?: string | null;
  receivedAt: Date;
  attachments: EmailAttachmentRecord[];
}

export interface SaveOutboundMessageParams {
  id: string;
  threadId?: string | null;
  fromEmail?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  snippet?: string | null;
  body?: string | null;
  receivedAt: Date;
  attachments?: EmailAttachmentRecord[];
}

@Injectable()
export class EmailAssistantQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async getLastHistoryId(userEmail: string): Promise<string | null> {
    const [state] = await this.db
      .select({ lastHistoryId: gmailSyncState.lastHistoryId })
      .from(gmailSyncState)
      .where(eq(gmailSyncState.userEmail, userEmail));

    return state?.lastHistoryId ?? null;
  }

  async saveLastHistoryId(userEmail: string, historyId: string): Promise<void> {
    await this.db
      .insert(gmailSyncState)
      .values({ userEmail, lastHistoryId: historyId })
      .onConflictDoUpdate({
        target: gmailSyncState.userEmail,
        set: { lastHistoryId: historyId, updatedAt: new Date() },
      });
  }

  async saveInboundMessage(params: SaveInboundMessageParams): Promise<boolean> {
    const {
      id,
      threadId = null,
      fromEmail = null,
      toEmail = null,
      subject = null,
      snippet = null,
      body = null,
      receivedAt,
      attachments,
    } = params;

    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(emailMessages)
        .values({
          id,
          threadId,
          fromEmail,
          toEmail,
          subject,
          snippet,
          body,
          hasAttachments: attachments.length > 0,
          receivedAt,
          direction: 'inbound',
        })
        .onConflictDoNothing()
        .returning({ id: emailMessages.id });

      if (!inserted.length) {
        return false;
      }

      if (attachments.length) {
        const attachmentValues = attachments.map((attachment) => ({
          messageId: id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          data: attachment.data,
        }));

        await tx.insert(emailAttachments).values(attachmentValues);
      }

      return true;
    });
  }

  async saveOutboundMessage(params: SaveOutboundMessageParams): Promise<void> {
    const {
      id,
      threadId = null,
      fromEmail = null,
      toEmail = null,
      subject = null,
      snippet = null,
      body = null,
      receivedAt,
      attachments = [],
    } = params;

    await this.db.transaction(async (tx) => {
      await tx.insert(emailMessages).values({
        id,
        threadId,
        fromEmail,
        toEmail,
        subject,
        snippet,
        body,
        hasAttachments: attachments.length > 0,
        receivedAt,
        direction: 'outbound',
      });

      if (!attachments.length) {
        return;
      }

      const attachmentValues = attachments.map((attachment) => ({
        messageId: id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        data: attachment.data,
      }));

      await tx.insert(emailAttachments).values(attachmentValues);
    });
  }

  async getMessageAttachments(messageId: string) {
    const rows = await this.db
      .select({
        id: emailAttachments.id,
        filename: emailAttachments.filename,
        mimeType: emailAttachments.mimeType,
        data: emailAttachments.data,
      })
      .from(emailAttachments)
      .where(eq(emailAttachments.messageId, messageId));

    return rows;
  }

}
