import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { JobQueueService } from './job-queue.service';
import { SERVICE_BUS_CLIENT, SERVICE_BUS_QUEUE_NAMES } from './queue.constants';
import { buildServiceBusConfiguration } from './queue.config';
import { ServiceBusClientProvider } from './service-bus-client.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    ServiceBusClientProvider,
    {
      provide: SERVICE_BUS_CLIENT,
      useFactory: (provider: ServiceBusClientProvider) => provider.client,
      inject: [ServiceBusClientProvider],
    },
    {
      provide: SERVICE_BUS_QUEUE_NAMES,
      useFactory: (config: ConfigService) => buildServiceBusConfiguration(config).queueNames,
      inject: [ConfigService],
    },
    JobQueueService,
  ],
  exports: [JobQueueService, SERVICE_BUS_CLIENT, SERVICE_BUS_QUEUE_NAMES],
})
export class QueueModule {}
