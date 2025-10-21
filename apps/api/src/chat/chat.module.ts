import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { FileController } from './controllers/file.controller';
import { FileDocumentService } from './services/file-document.service';
import { CloudflareR2Service } from '../services/cloudflare-r2.service';
import { ChatQueryService } from 'src/database/queries/chat.query';
import { MessageQueryService } from 'src/database/queries/message.query';
import { DocumentQueryService } from 'src/database/queries/document.query';
import { VoteQueryService } from 'src/database/queries/vote.query';
import { AssistantQueryService } from 'src/database/queries/assistant.query';
import { AssistantKnowledgeQueryService } from 'src/database/queries/assistant-knowledge.query';
import { DatabaseModule } from 'src/database/database.module';
import { LinkUpSoWebSearchToolService } from 'src/lib/tools/linkup-so-web-search.tool';
import { CloudflareAIGatewayService } from 'src/services/cloudflare-ai-gateway.service';
import { MemoryService } from './services/memory.service';
import { Mem0MemoryService } from './services/mem0-memory.service';
import { McpToolService } from './services/mcp-tool.service';
import { TextProcessingService } from './services/text-processing.service';
import { AIResponseService } from './services/ai-response.service';
import { DocumentProcessingService } from './services/document-processing.service';
import { DocumentProcessingProcessor } from './processors/document-processing.processor';
import { QueueModule } from 'src/queue/queue.module';
import { TenantModule } from 'src/tenant/tenant.module';

@Module({
  imports: [DatabaseModule, ConfigModule, QueueModule, TenantModule],
  controllers: [ChatController, FileController],
  providers: [
    ChatService,
    FileDocumentService,
    DocumentProcessingService,
    DocumentProcessingProcessor,
    CloudflareR2Service,
    CloudflareAIGatewayService,
    ChatQueryService,
    MessageQueryService,
    DocumentQueryService,
    VoteQueryService,
    AssistantQueryService,
    AssistantKnowledgeQueryService,
    LinkUpSoWebSearchToolService,
    MemoryService,
    Mem0MemoryService,
    McpToolService,
    TextProcessingService,
    AIResponseService,
  ],
})
export class ChatModule {}
