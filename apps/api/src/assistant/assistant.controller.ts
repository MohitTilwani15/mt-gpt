import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard, Session, UserSession } from '@mguay/nestjs-better-auth';
import type { Request } from 'express';

import { AssistantService } from './assistant.service';
import { CreateAssistantDto, ShareAssistantDto, UpdateAssistantDto } from './dto/assistant.dto';
import { TenantService } from 'src/tenant/tenant.service';

@Controller('assistants')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(
    private readonly assistantService: AssistantService,
    private readonly tenantService: TenantService,
  ) {}

  @Get()
  async listAssistants(@Session() session: UserSession, @Req() req: Request) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    return this.assistantService.listAssistants(session.user.id, tenant.tenantId);
  }

  @Post()
  async createAssistant(
    @Body() dto: CreateAssistantDto,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    return this.assistantService.createAssistant(session.user.id, tenant.tenantId, dto);
  }

  @Get(':id')
  async getAssistant(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    return this.assistantService.getAssistant(session.user.id, tenant.tenantId, id);
  }

  @Patch(':id')
  async updateAssistant(
    @Param('id') id: string,
    @Body() dto: UpdateAssistantDto,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    return this.assistantService.updateAssistant(session.user.id, tenant.tenantId, id, dto);
  }

  @Delete(':id')
  async deleteAssistant(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    await this.assistantService.deleteAssistant(session.user.id, tenant.tenantId, id);
    return { id, deleted: true };
  }

  @Post(':id/share')
  async shareAssistant(
    @Param('id') id: string,
    @Body() dto: ShareAssistantDto,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    return this.assistantService.shareAssistant(session.user.id, tenant.tenantId, id, dto);
  }

  @Get(':id/shares')
  async listShares(
    @Param('id') id: string,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    return this.assistantService.listShares(session.user.id, tenant.tenantId, id);
  }

  @Delete(':id/share/:userId')
  async revokeShare(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Session() session: UserSession,
    @Req() req: Request,
  ) {
    const tenant = await this.tenantService.resolveTenantContext(session, req);
    await this.assistantService.revokeShare(session.user.id, tenant.tenantId, id, userId);
    return { assistantId: id, userId, revoked: true };
  }
}
