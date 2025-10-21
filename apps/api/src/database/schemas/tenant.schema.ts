import { pgTable, uuid, text, timestamp, jsonb, primaryKey, pgEnum } from 'drizzle-orm/pg-core';
import { InferSelectModel, relations } from 'drizzle-orm';

import { user } from './auth.schema';

export const tenantRoleEnum = pgEnum('tenant_role', ['owner', 'admin', 'member', 'viewer']);

export const tenant = pgTable('Tenant', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Tenant = InferSelectModel<typeof tenant>;

export const tenantMembership = pgTable(
  'TenantMembership',
  {
    tenantId: uuid('tenantId')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: tenantRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
  ],
);

export type TenantMembership = InferSelectModel<typeof tenantMembership>;

export const tenantRelations = relations(tenant, ({ many }) => ({
  memberships: many(tenantMembership),
}));

export const tenantMembershipRelations = relations(tenantMembership, ({ one }) => ({
  tenant: one(tenant, {
    fields: [tenantMembership.tenantId],
    references: [tenant.id],
  }),
  user: one(user, {
    fields: [tenantMembership.userId],
    references: [user.id],
  }),
}));
