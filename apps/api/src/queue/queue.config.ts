import { RegisterQueueAsyncOptions } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { DOCUMENT_PROCESSING_QUEUE, EMAIL_REPLY_QUEUE } from './queue.constants';

export const buildConnection = (config: ConfigService) => {
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

export const queueAsyncRegistrations: RegisterQueueAsyncOptions[] = [
  {
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
  },
  {
    name: EMAIL_REPLY_QUEUE,
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      connection: buildConnection(config),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
        removeOnComplete: 100,
      },
    }),
  },
];
