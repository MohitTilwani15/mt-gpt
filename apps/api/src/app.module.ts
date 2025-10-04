import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '@mguay/nestjs-better-auth';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { DatabaseModule } from './database/database.module';
import { DATABASE_CONNECTION } from './database/database-connection';
import { ChatModule } from './chat/chat.module';
import { AssistantModule } from './assistant/assistant.module';
import { EmailAssistantModule } from './email-assistant/email-assistant.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,
    ChatModule,
    AssistantModule,
    EmailAssistantModule,
    AuthModule.forRootAsync({
      imports: [DatabaseModule, ConfigModule],
      useFactory: (database: NodePgDatabase, configService: ConfigService) => ({
        auth: betterAuth({
          database: drizzleAdapter(database, {
            provider: 'pg',
          }),
          trustedOrigins: [
            configService.getOrThrow('FRONTEND_URL'),
            'https://localhost:3000', // Local word add-in
            'http://localhost:3001' // Local web
          ],
          advanced: {
            defaultCookieAttributes: {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
              domain: configService.getOrThrow('COOKIE_DOMAIN'),
            },
          },
          emailAndPassword: {
            enabled: true,
          },
        }),
      }),
      inject: [DATABASE_CONNECTION, ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
