import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceBusClient } from '@azure/service-bus';

import { buildServiceBusConfiguration } from './queue.config';

@Injectable()
export class ServiceBusClientProvider implements OnModuleDestroy {
  readonly client: ServiceBusClient;

  constructor(config: ConfigService) {
    const { connectionString } = buildServiceBusConfiguration(config);
    this.client = new ServiceBusClient(connectionString);
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
