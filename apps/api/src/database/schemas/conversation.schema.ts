import { pgTable, timestamp, uuid, varchar, boolean, primaryKey, vector, integer, jsonb, index, check } from "drizzle-orm/pg-core";
import { text } from "drizzle-orm/pg-core";
import { InferSelectModel, sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { UIMessage } from "ai";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";

import { user } from "./auth.schema";
import { MyProviderMetadata } from '../../lib/message-type'

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  title: text('title'),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  lastContext: jsonb('lastContext').$type<LanguageModelV2Usage | null>(),
  isPublic: boolean('isPublic').notNull().default(false),
  isArchived: boolean('isArchived').notNull().default(false),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable('Message',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    role: varchar().$type<UIMessage["role"]>().notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [
    index("messages_chat_id_idx").on(table.chatId),
    index("messages_chat_id_created_at_idx").on(table.chatId, table.createdAt),
  ],
);

export type DBMessage = InferSelectModel<typeof message>;

export const parts = pgTable(
  "parts",
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    messageId: uuid('messageId').references(() => message.id, { onDelete: "cascade" }).notNull(),
    type: varchar().$type<UIMessage["parts"][0]["type"]>().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    order: integer().notNull().default(0),

    // Text fields
    text_text: text(),

    // Reasoning fields
    reasoning_text: text(),

    // File fields
    file_mediaType: varchar(),
    file_filename: varchar(),
    file_url: varchar(),

    // Source url fields
    source_url_sourceId: varchar(),
    source_url_url: varchar(),
    source_url_title: varchar(),

    // Source document fields
    source_document_sourceId: varchar(),
    source_document_mediaType: varchar(),
    source_document_title: varchar(),
    source_document_filename: varchar(),

    providerMetadata: jsonb().$type<MyProviderMetadata>(),
  },
  (table) => [
    index("parts_message_id_idx").on(table.messageId),
    index("parts_message_id_order_idx").on(table.messageId, table.order),

    check(
      "text_text_required_if_type_is_text",
      sql`CASE WHEN ${table.type} = 'text' THEN ${table.text_text} IS NOT NULL ELSE TRUE END`,
    ),
    check(
      "reasoning_text_required_if_type_is_reasoning",
      sql`CASE WHEN ${table.type} = 'reasoning' THEN ${table.reasoning_text} IS NOT NULL ELSE TRUE END`,
    ),
    check(
      "file_fields_required_if_type_is_file",
      sql`CASE WHEN ${table.type} = 'file' THEN ${table.file_mediaType} IS NOT NULL AND ${table.file_url} IS NOT NULL ELSE TRUE END`,
    ),
    check(
      "source_url_fields_required_if_type_is_source_url",
      sql`CASE WHEN ${table.type} = 'source_url' THEN ${table.source_url_sourceId} IS NOT NULL AND ${table.source_url_url} IS NOT NULL ELSE TRUE END`,
    ),
    check(
      "source_document_fields_required_if_type_is_source_document",
      sql`CASE WHEN ${table.type} = 'source_document' THEN ${table.source_document_sourceId} IS NOT NULL AND ${table.source_document_mediaType} IS NOT NULL AND ${table.source_document_title} IS NOT NULL ELSE TRUE END`,
    ),
  ]
)

export type Parts = InferSelectModel<typeof parts>
export type MyDBUIMessagePart = typeof parts.$inferInsert;
export type MyDBUIMessagePartSelect = typeof parts.$inferSelect;

export const vote = pgTable('Vote', {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
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
    .references(() => chat.id, { onDelete: "cascade" }),
  messageId: uuid('messageId')
    .references(() => message.id, { onDelete: "cascade" }),
  fileName: varchar('fileName', { length: 255 }).notNull(),
  fileKey: varchar('fileKey', { length: 500 }).notNull(),
  fileSize: integer('fileSize').notNull(),
  mimeType: varchar('mimeType', { length: 100 }).notNull(),
  text: text('text'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('createdAt').notNull(),
});

export type Document = InferSelectModel<typeof document>;

export const chatRelations = relations(chat, ({ many }) => ({
  messages: many(message),
  documents: many(document),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
  parts: many(parts),
  documents: many(document),
}));

export const partsRelations = relations(parts, ({ one }) => ({
  message: one(message, {
    fields: [parts.messageId],
    references: [message.id],
  }),
}));

export const documentRelations = relations(document, ({ one }) => ({
  chat: one(chat, {
    fields: [document.chatId],
    references: [chat.id],
  }),
  message: one(message, {
    fields: [document.messageId],
    references: [message.id],
  }),
}));
