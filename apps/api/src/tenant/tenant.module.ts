import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/database/database.module';
import { TenantQueryService } from 'src/database/queries/tenant.query';
import { TenantService } from './tenant.service';

@Module({
  imports: [DatabaseModule],
  providers: [TenantQueryService, TenantService],
  exports: [TenantService, TenantQueryService],
})
export class TenantModule {}
