import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Session, UserSession } from '@mguay/nestjs-better-auth';

import { AssistantService } from './assistant.service';
import { CreateAssistantDto, ShareAssistantDto, UpdateAssistantDto } from './dto/assistant.dto';

@Controller('assistants')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get()
  async listAssistants(@Session() session: UserSession) {
    return this.assistantService.listAssistants(session.user.id);
  }

  @Post()
  async createAssistant(
    @Body() dto: CreateAssistantDto,
    @Session() session: UserSession,
  ) {
    return this.assistantService.createAssistant(session.user.id, dto);
  }

  @Get(':id')
  async getAssistant(
    @Param('id') id: string,
    @Session() session: UserSession,
  ) {
    return this.assistantService.getAssistant(session.user.id, id);
  }

  @Patch(':id')
  async updateAssistant(
    @Param('id') id: string,
    @Body() dto: UpdateAssistantDto,
    @Session() session: UserSession,
  ) {
    return this.assistantService.updateAssistant(session.user.id, id, dto);
  }

  @Delete(':id')
  async deleteAssistant(
    @Param('id') id: string,
    @Session() session: UserSession,
  ) {
    await this.assistantService.deleteAssistant(session.user.id, id);
    return { id, deleted: true };
  }

  @Post(':id/share')
  async shareAssistant(
    @Param('id') id: string,
    @Body() dto: ShareAssistantDto,
    @Session() session: UserSession,
  ) {
    return this.assistantService.shareAssistant(session.user.id, id, dto);
  }

  @Get(':id/shares')
  async listShares(
    @Param('id') id: string,
    @Session() session: UserSession,
  ) {
    return this.assistantService.listShares(session.user.id, id);
  }

  @Delete(':id/share/:userId')
  async revokeShare(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Session() session: UserSession,
  ) {
    await this.assistantService.revokeShare(session.user.id, id, userId);
    return { assistantId: id, userId, revoked: true };
  }
}
