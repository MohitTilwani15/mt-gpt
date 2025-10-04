import { pgTable, text, timestamp, boolean, serial } from 'drizzle-orm/pg-core';

export const gmailSyncState = pgTable('gmail_sync_state', {
  userEmail: text('user_email').primaryKey(),
  lastHistoryId: text('last_history_id').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const emailMessages = pgTable('gmail_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id'),
  fromEmail: text('from_email'),
  toEmail: text('to_email'),
  subject: text('subject'),
  snippet: text('snippet'),
  body: text('body'),
  hasAttachments: boolean('has_attachments'),
  receivedAt: timestamp('received_at'),
  direction: text('direction'),
});

export const emailAttachments = pgTable('gmail_attachments', {
  id: serial('id').primaryKey(),
  messageId: text('message_id')
    .references(() => emailMessages.id)
    .notNull(),
  filename: text('filename'),
  mimeType: text('mime_type'),
  data: text('data'),
});
