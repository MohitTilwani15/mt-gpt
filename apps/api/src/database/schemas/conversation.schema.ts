import { pgTable, timestamp, uuid, varchar, json, boolean, primaryKey, vector, integer } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { text } from "drizzle-orm/pg-core";
import { InferSelectModel } from "drizzle-orm";

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable('Vote', {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.messageId] }),
  ],
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable('Document', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  messageId: uuid('messageId')
    .references(() => message.id),
  fileName: varchar('fileName', { length: 255 }).notNull(),
  fileKey: varchar('fileKey', { length: 500 }).notNull(),
  fileSize: integer('fileSize').notNull(),
  mimeType: varchar('mimeType', { length: 100 }).notNull(),
  text: text('text'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('createdAt').notNull(),
});

export type Document = InferSelectModel<typeof document>;

export const messageDocument = pgTable('MessageDocument', {
  messageId: uuid('messageId')
    .notNull()
    .references(() => message.id, { onDelete: 'cascade' }),
  documentId: uuid('documentId')
    .notNull()
    .references(() => document.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.messageId, table.documentId] }),
]);

export type MessageDocument = InferSelectModel<typeof messageDocument>;