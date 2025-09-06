import { PgTransaction } from 'drizzle-orm/pg-core';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { ExtractTablesWithRelations } from 'drizzle-orm';
import * as authSchema from './schemas/auth.schema';
import * as conversationSchema from './schemas/conversation.schema';
import * as streamSchema from './schemas/stream.schema';

const databaseSchema = {
  ...authSchema,
  ...conversationSchema,
  ...streamSchema,
};

export type PostgresTransaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof databaseSchema,
  ExtractTablesWithRelations<typeof databaseSchema>
>;
