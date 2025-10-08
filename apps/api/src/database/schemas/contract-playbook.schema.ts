import { pgTable, text, timestamp, boolean, uuid, integer } from 'drizzle-orm/pg-core';

export const contractPlaybooks = pgTable('contract_playbooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  contractType: text('contract_type').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
