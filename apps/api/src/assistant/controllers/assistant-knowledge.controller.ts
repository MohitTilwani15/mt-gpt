import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard, Session, UserSession } from '@mguay/nestjs-better-auth';

import { AssistantKnowledgeService } from '../services/assistant-knowledge.service';
import { UploadAssistantKnowledgeDto } from '../dto/assistant.dto';

@Controller('assistants/:id/knowledge')
@UseGuards(AuthGuard)
export class AssistantKnowledgeController {
  constructor(private readonly assistantKnowledgeService: AssistantKnowledgeService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadKnowledge(
    @Param('id') assistantId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadAssistantKnowledgeDto,
    @Session() session: UserSession,
  ) {
    return this.assistantKnowledgeService.uploadKnowledge({
      assistantId,
      files,
      extractText: body?.extractText,
      userId: session.user.id,
    });
  }

  @Delete(':knowledgeId')
  async deleteKnowledge(
    @Param('id') assistantId: string,
    @Param('knowledgeId') knowledgeId: string,
    @Session() session: UserSession,
  ) {
    await this.assistantKnowledgeService.deleteKnowledge(assistantId, knowledgeId, session.user.id);
    return { assistantId, knowledgeId, deleted: true };
  }
}
