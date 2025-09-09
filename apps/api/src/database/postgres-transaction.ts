import { PgTransaction } from 'drizzle-orm/pg-core';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { ExtractTablesWithRelations } from 'drizzle-orm';
import * as authSchema from './schemas/auth.schema';
import * as conversationSchema from './schemas/conversation.schema';

const databaseSchema = {
  ...authSchema,
  ...conversationSchema,
};

export type PostgresTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof databaseSchema,
  ExtractTablesWithRelations<typeof databaseSchema>
>;
