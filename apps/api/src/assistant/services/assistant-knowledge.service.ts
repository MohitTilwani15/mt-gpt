import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { extractText, getDocumentProxy } from 'unpdf';
import * as mammoth from 'mammoth';

import { AssistantQueryService } from 'src/database/queries/assistant.query';
import { AssistantKnowledgeQueryService } from 'src/database/queries/assistant-knowledge.query';
import { CloudflareR2Service } from 'src/services/cloudflare-r2.service';

interface UploadKnowledgeParams {
  assistantId: string;
  tenantId: string;
  files: Express.Multer.File[];
  extractText?: boolean;
  userId: string;
}

@Injectable()
export class AssistantKnowledgeService {
  constructor(
    private readonly assistantQueryService: AssistantQueryService,
    private readonly assistantKnowledgeQueryService: AssistantKnowledgeQueryService,
    private readonly cloudflareR2Service: CloudflareR2Service,
    private readonly configService: ConfigService,
  ) {}

  private async ensureCanManageKnowledge(assistantId: string, tenantId: string, userId: string) {
    const assistant = await this.assistantQueryService.getAssistantForUser(assistantId, userId, tenantId);

    if (!assistant) {
      throw new NotFoundException('Assistant not found');
    }

    if (assistant.ownerId === userId) {
      return assistant;
    }

    const share = assistant.shares?.find((s) => s.userId === userId);

    if (!share || !share.canManage) {
      throw new ForbiddenException('You do not have permission to modify this assistant');
    }

    return assistant;
  }

  async uploadKnowledge(params: UploadKnowledgeParams) {
    const {
      assistantId,
      tenantId,
      files,
      extractText: shouldExtractTextInput,
      userId,
    } = params;
    const shouldExtractText = shouldExtractTextInput ?? true;

    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    await this.ensureCanManageKnowledge(assistantId, tenantId, userId);

    const uploads = [] as Array<Promise<any>>;

    for (const file of files) {
      uploads.push(this.processSingleFile({ assistantId, tenantId, file, shouldExtractText, userId }));
    }

    return Promise.all(uploads);
  }

  private async processSingleFile({
    assistantId,
    tenantId,
    file,
    shouldExtractText,
    userId,
  }: {
    assistantId: string;
    tenantId: string;
    file: Express.Multer.File;
    shouldExtractText: boolean;
    userId: string;
  }) {
    const { key: fileKey, url } = await this.cloudflareR2Service.uploadFile({ file });

    let textContent: string | null = null;
    let embedding: number[] | null = null;

    try {
      if (shouldExtractText) {
        if (file.mimetype === 'application/pdf') {
          const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
          const { text } = await extractText(pdf, { mergePages: true });
          textContent = text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          textContent = result.value;
        } else if (file.mimetype?.startsWith('text/')) {
          textContent = file.buffer.toString('utf8');
        }

        if (textContent && textContent.trim()) {
          textContent = textContent.trim();
          const { embedding: computedEmbedding } = await embed({
            model: openai.embedding(this.configService.getOrThrow<string>('EMBEDDING_MODEL')),
            value: textContent,
          });
          if (computedEmbedding) {
            const asArray = Array.from(computedEmbedding);
            embedding = asArray.length ? asArray : null;
          }
        }
      }

      const record = await this.assistantKnowledgeQueryService.createKnowledgeRecord({
        assistantId,
        tenantId,
        fileName: file.originalname,
        fileKey,
        fileSize: file.size,
        mimeType: file.mimetype,
        text: textContent,
        embedding,
        uploadedBy: userId,
      });

      return {
        id: record.id,
        fileName: record.fileName,
        mimeType: record.mimeType,
        fileSize: record.fileSize,
        downloadUrl: url,
        createdAt: record.createdAt,
      };
    } catch (error) {
      await this.cloudflareR2Service.deleteFile(fileKey).catch(() => undefined);
      throw error;
    }
  }

  async deleteKnowledge(assistantId: string, tenantId: string, knowledgeId: string, userId: string) {
    await this.ensureCanManageKnowledge(assistantId, tenantId, userId);

    const record = await this.assistantKnowledgeQueryService.deleteKnowledgeRecord(assistantId, tenantId, knowledgeId);

    if (!record) {
      throw new NotFoundException('Knowledge item not found');
    }

    await this.cloudflareR2Service.deleteFile(record.fileKey).catch(() => undefined);

    return record;
  }
}
