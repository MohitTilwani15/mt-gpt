import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { JobQueueService } from './job-queue.service';
import { DOCUMENT_PROCESSING_QUEUE } from './queue.constants';

const buildConnection = (config: ConfigService) => {
  const redisUrl = config.get<string>('REDIS_URL');
  if (redisUrl) {
    return { url: redisUrl };
  }

  const host = config.get<string>('REDIS_HOST') ?? '127.0.0.1';
  const port = Number.parseInt(config.get<string>('REDIS_PORT') ?? '6379', 10);
  const username = config.get<string>('REDIS_USERNAME');
  const password = config.get<string>('REDIS_PASSWORD');
  const useTls = config.get<string>('REDIS_TLS') === 'true';

  return {
    host,
    port,
    username: username ?? undefined,
    password: password ?? undefined,
    tls: useTls ? {} : undefined,
  };
};

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: buildConnection(config),
      }),
    }),
    BullModule.registerQueueAsync({
      name: DOCUMENT_PROCESSING_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: buildConnection(config),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 15_000,
          },
          removeOnComplete: 100,
        },
      }),
    }),
  ],
  providers: [JobQueueService],
  exports: [JobQueueService, BullModule],
})
export class QueueModule {}
