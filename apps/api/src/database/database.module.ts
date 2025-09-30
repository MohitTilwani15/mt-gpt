import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { upstashCache } from 'drizzle-orm/cache/upstash';

import { DATABASE_CONNECTION } from './database-connection';
import { databaseSchema } from './schemas';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        });

        return drizzle(pool, {
          schema: databaseSchema,
          cache: upstashCache({
            url: configService.getOrThrow<string>('UPSTASH_REDIS_REST_URL'),
            token: configService.getOrThrow<string>('UPSTASH_REDIS_REST_TOKEN'),
          }),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
