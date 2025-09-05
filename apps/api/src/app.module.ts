import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '@mguay/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { DatabaseModule } from './database/database.module';
import { DATABASE_CONNECTION } from './database/database-connection';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule.forRootAsync({
      imports: [DatabaseModule, ConfigModule],
      useFactory: (database: NodePgDatabase, configService: ConfigService) => ({
        auth: betterAuth({
          database: drizzleAdapter(database, {
            provider: 'pg',
          }),
          trustedOrigins: [configService.getOrThrow('FRONTEND_URL')],
          emailAndPassword: {
            enabled: true,
          },
          socialProviders: {
            google: {
              clientId: configService.getOrThrow('GOOGLE_CLIENT_ID'),
              clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
              redirectURI: configService.getOrThrow('GOOGLE_REDIRECT_URI'),
            },
          },
        }),
      }),
      inject: [DATABASE_CONNECTION, ConfigService],
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
