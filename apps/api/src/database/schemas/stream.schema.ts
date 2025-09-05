import { InferSelectModel } from "drizzle-orm";
import { foreignKey, pgTable, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { chat } from "./conversation.schema";

export const stream = pgTable(
  'Stream',
  {
    id: uuid('id').notNull().defaultRandom(),
    chatId: uuid('chatId').notNull(),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  ],
);

export type Stream = InferSelectModel<typeof stream>;
