import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { JobQueueService } from './job-queue.service';
import { queueAsyncRegistrations, buildConnection } from './queue.config';

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
    BullModule.registerQueueAsync(...queueAsyncRegistrations),
  ],
  providers: [JobQueueService],
  exports: [JobQueueService, BullModule],
})
export class QueueModule {}
