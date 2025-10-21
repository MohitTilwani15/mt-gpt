import { jsonb, pgTable, primaryKey, text, timestamp, uuid, varchar, boolean, integer, vector } from 'drizzle-orm/pg-core';
import { InferSelectModel, relations, sql } from 'drizzle-orm';

import { user } from './auth.schema';
import { tenant } from './tenant.schema';

export interface AssistantCapabilities {
  webSearch?: boolean;
  imageGeneration?: boolean;
  [key: string]: boolean | undefined;
}

export const assistant = pgTable('Assistant', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  ownerId: text('ownerId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenantId')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  instructions: text('instructions'),
  defaultModel: varchar('defaultModel', { length: 120 }),
  capabilities: jsonb('capabilities')
    .$type<AssistantCapabilities>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

export type Assistant = InferSelectModel<typeof assistant>;

export const assistantShare = pgTable(
  'AssistantShare',
  {
    assistantId: uuid('assistantId')
      .notNull()
      .references(() => assistant.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenantId')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    canManage: boolean('canManage').notNull().default(false),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.assistantId, table.userId] }),
  ],
);

export type AssistantShare = InferSelectModel<typeof assistantShare>;

export const assistantKnowledge = pgTable('AssistantKnowledge', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  assistantId: uuid('assistantId')
    .notNull()
    .references(() => assistant.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenantId')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  fileName: varchar('fileName', { length: 255 }).notNull(),
  fileKey: varchar('fileKey', { length: 500 }).notNull(),
  fileSize: integer('fileSize'),
  mimeType: varchar('mimeType', { length: 100 }).notNull(),
  text: text('text'),
  embedding: vector('embedding', { dimensions: 1536 }),
  uploadedBy: text('uploadedBy')
    .references(() => user.id, { onDelete: 'set null' }),
});

export type AssistantKnowledge = InferSelectModel<typeof assistantKnowledge>;

export const assistantRelations = relations(assistant, ({ many, one }) => ({
  shares: many(assistantShare),
  knowledge: many(assistantKnowledge),
  tenant: one(tenant, {
    fields: [assistant.tenantId],
    references: [tenant.id],
  }),
}));

export const assistantShareRelations = relations(assistantShare, ({ one }) => ({
  assistant: one(assistant, {
    fields: [assistantShare.assistantId],
    references: [assistant.id],
  }),
  tenant: one(tenant, {
    fields: [assistantShare.tenantId],
    references: [tenant.id],
  }),
  user: one(user, {
    fields: [assistantShare.userId],
    references: [user.id],
  }),
}));

export const assistantKnowledgeRelations = relations(assistantKnowledge, ({ one }) => ({
  assistant: one(assistant, {
    fields: [assistantKnowledge.assistantId],
    references: [assistant.id],
  }),
  tenant: one(tenant, {
    fields: [assistantKnowledge.tenantId],
    references: [tenant.id],
  }),
  uploader: one(user, {
    fields: [assistantKnowledge.uploadedBy],
    references: [user.id],
  }),
}));
