import { pgTable, uuid, timestamp, varchar, text as pgText, vector, integer, index } from 'drizzle-orm/pg-core';
import { InferSelectModel, relations } from 'drizzle-orm';

import { user } from './auth.schema';
import { chat, message } from './conversation.schema';
import { tenant } from './tenant.schema';

export const memory = pgTable(
  'Memory',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    userId: varchar('userId').notNull().references(() => user.id),
    tenantId: uuid('tenantId')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    chatId: uuid('chatId').references(() => chat.id, { onDelete: 'cascade' }),
    messageId: uuid('messageId').references(() => message.id, { onDelete: 'set null' }),
    text: pgText('text').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('createdAt').defaultNow().notNull(),
    expiresAt: timestamp('expiresAt'),
  },
  (table) => [
    index('memory_user_id_idx').on(table.userId),
    index('memory_chat_id_idx').on(table.chatId),
    index('memory_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export type Memory = InferSelectModel<typeof memory>;

export const memoryRelations = relations(memory, ({ one }) => ({
  user: one(user, {
    fields: [memory.userId],
    references: [user.id],
  }),
  tenant: one(tenant, {
    fields: [memory.tenantId],
    references: [tenant.id],
  }),
  chat: one(chat, {
    fields: [memory.chatId],
    references: [chat.id],
  }),
  message: one(message, {
    fields: [memory.messageId],
    references: [message.id],
  }),
}));
