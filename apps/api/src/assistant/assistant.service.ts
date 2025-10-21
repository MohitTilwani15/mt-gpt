import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';

import { AssistantQueryService } from 'src/database/queries/assistant.query';
import { AssistantKnowledgeQueryService } from 'src/database/queries/assistant-knowledge.query';
import { UserQueryService } from 'src/database/queries/user.query';
import { CloudflareR2Service } from 'src/services/cloudflare-r2.service';
import type { AssistantCapabilities } from 'src/database/schemas/assistant.schema';
import type { CreateAssistantDto, UpdateAssistantDto, ShareAssistantDto, AssistantCapabilitiesDto } from './dto/assistant.dto';

@Injectable()
export class AssistantService {
  constructor(
    private readonly assistantQueryService: AssistantQueryService,
    private readonly assistantKnowledgeQueryService: AssistantKnowledgeQueryService,
    private readonly userQueryService: UserQueryService,
    private readonly cloudflareR2Service: CloudflareR2Service,
  ) {}

  private mapCapabilities(capabilities?: AssistantCapabilitiesDto) {
    if (!capabilities) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(capabilities).filter(([, value]) => value !== undefined),
    ) as AssistantCapabilities | undefined;
  }

  async listAssistants(userId: string, tenantId: string) {
    return this.assistantQueryService.listAssistantsForUser(userId, tenantId);
  }

  async getAssistant(userId: string, tenantId: string, assistantId: string) {
    const assistant = await this.assistantQueryService.getAssistantForUser(assistantId, userId, tenantId);

    if (!assistant) {
      throw new NotFoundException('Assistant not found');
    }

    const knowledgeRecords = await this.assistantKnowledgeQueryService.listKnowledge(assistantId, tenantId);

    const knowledge = await Promise.all(
      knowledgeRecords.map(async (record) => ({
        ...record,
        downloadUrl: await this.cloudflareR2Service.getDownloadUrl({
          key: record.fileKey,
          asAttachmentName: record.fileName,
        }),
      })),
    );

    return {
      ...assistant,
      knowledge,
    };
  }

  async createAssistant(userId: string, tenantId: string, dto: CreateAssistantDto) {
    const assistant = await this.assistantQueryService.createAssistant({
      ownerId: userId,
      tenantId,
      name: dto.name,
      description: dto.description,
      instructions: dto.instructions,
      defaultModel: dto.defaultModel,
      capabilities: this.mapCapabilities(dto.capabilities),
    });

    return assistant;
  }

  async updateAssistant(userId: string, tenantId: string, assistantId: string, dto: UpdateAssistantDto) {
    const updated = await this.assistantQueryService.updateAssistant({
      assistantId,
      ownerId: userId,
      tenantId,
      name: dto.name,
      description: dto.description,
      instructions: dto.instructions,
      defaultModel: dto.defaultModel,
      capabilities: this.mapCapabilities(dto.capabilities),
    });

    if (!updated) {
      throw new NotFoundException('Assistant not found or you do not have permission to update it');
    }

    return updated;
  }

  async deleteAssistant(userId: string, tenantId: string, assistantId: string) {
    const deleted = await this.assistantQueryService.deleteAssistant(assistantId, userId, tenantId);

    if (!deleted) {
      throw new NotFoundException('Assistant not found or you do not have permission to delete it');
    }

    return deleted;
  }

  async shareAssistant(ownerId: string, tenantId: string, assistantId: string, dto: ShareAssistantDto) {
    const assistant = await this.assistantQueryService.getAssistantById(assistantId, tenantId);

    if (!assistant) {
      throw new NotFoundException('Assistant not found');
    }

    if (assistant.ownerId !== ownerId) {
      throw new ForbiddenException('Only the owner can manage shares');
    }

    const user = await this.userQueryService.findByEmail(dto.email);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === ownerId) {
      throw new BadRequestException('You already own this assistant');
    }

    const share = await this.assistantQueryService.upsertShare({
      assistantId,
      tenantId,
      userId: user.id,
      canManage: dto.canManage ?? false,
    });

    return share;
  }

  async revokeShare(ownerId: string, tenantId: string, assistantId: string, targetUserId: string) {
    const assistant = await this.assistantQueryService.getAssistantById(assistantId, tenantId);

    if (!assistant) {
      throw new NotFoundException('Assistant not found');
    }

    if (assistant.ownerId !== ownerId) {
      throw new ForbiddenException('Only the owner can revoke shares');
    }

    const removed = await this.assistantQueryService.removeShare({ assistantId, tenantId, userId: targetUserId });

    if (!removed) {
      throw new NotFoundException('Share not found');
    }

    return removed;
  }

  async listShares(userId: string, tenantId: string, assistantId: string) {
    const assistant = await this.assistantQueryService.getAssistantForUser(assistantId, userId, tenantId);

    if (!assistant) {
      throw new NotFoundException('Assistant not found');
    }

    if (assistant.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can view sharing details');
    }

    return this.assistantQueryService.listShares(assistantId, tenantId);
  }
}
