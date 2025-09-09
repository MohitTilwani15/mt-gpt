import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { FileController } from './controllers/file.controller';
import { FileDocumentService } from './services/file-document.service';
import { CloudflareR2Service } from '../services/cloudflare-r2.service';
import { ChatQueryService } from 'src/database/queries/chat.query';
import { MessageQueryService } from 'src/database/queries/message.query';
import { DocumentQueryService } from 'src/database/queries/document.query';
import { DatabaseModule } from 'src/database/database.module';
import { ConfigModule } from '@nestjs/config';

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
  ],
})
export class ChatModule {}
