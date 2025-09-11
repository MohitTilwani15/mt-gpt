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
import { DatabaseModule } from 'src/database/database.module';
import { LinkUpSoWebSearchToolService } from 'src/lib/tools/linkup-so-web-search.tool';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [ChatController, FileController],
  providers: [
    ChatService,
    FileDocumentService,
    CloudflareR2Service,
    ChatQueryService,
    MessageQueryService,
    DocumentQueryService,
    VoteQueryService,
    LinkUpSoWebSearchToolService
  ],
})
export class ChatModule {}
