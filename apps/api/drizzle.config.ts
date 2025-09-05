import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

config({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in the environment');
}

const drizzleConfig: Config = {
  schema: './src/database/schemas',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
};

export default drizzleConfig;
