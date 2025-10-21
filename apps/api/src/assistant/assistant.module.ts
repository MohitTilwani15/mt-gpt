import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from 'src/database/database.module';
import { AssistantController } from './assistant.controller';
import { AssistantKnowledgeController } from './controllers/assistant-knowledge.controller';
import { AssistantService } from './assistant.service';
import { AssistantKnowledgeService } from './services/assistant-knowledge.service';
import { AssistantQueryService } from 'src/database/queries/assistant.query';
import { AssistantKnowledgeQueryService } from 'src/database/queries/assistant-knowledge.query';
import { UserQueryService } from 'src/database/queries/user.query';
import { CloudflareR2Service } from 'src/services/cloudflare-r2.service';
import { TenantModule } from 'src/tenant/tenant.module';

@Module({
  imports: [DatabaseModule, ConfigModule, TenantModule],
  controllers: [AssistantController, AssistantKnowledgeController],
  providers: [
    AssistantService,
    AssistantKnowledgeService,
    AssistantQueryService,
    AssistantKnowledgeQueryService,
    UserQueryService,
    CloudflareR2Service,
  ],
  exports: [AssistantService],
})
export class AssistantModule {}
