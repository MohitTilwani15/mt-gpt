import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard, Session, UserSession } from '@mguay/nestjs-better-auth';
import type { Request } from 'express';

import { AssistantKnowledgeService } from '../services/assistant-knowledge.service';
import { UploadAssistantKnowledgeDto } from '../dto/assistant.dto';
import { TenantService } from 'src/tenant/tenant.service';

@Controller('assistants/:id/knowledge')
@UseGuards(AuthGuard)
export class AssistantKnowledgeController {
  constructor(
    private readonly assistantKnowledgeService: AssistantKnowledgeService,
    private readonly tenantService: TenantService,
  ) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadKnowledge(
    @Param('id') assistantId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadAssistantKnowledgeDto,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    return this.assistantKnowledgeService.uploadKnowledge({
      assistantId,
      tenantId: tenant.tenantId,
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
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    await this.assistantKnowledgeService.deleteKnowledge(assistantId, tenant.tenantId, knowledgeId, session.user.id);
    return { assistantId, knowledgeId, deleted: true };
  }
}
