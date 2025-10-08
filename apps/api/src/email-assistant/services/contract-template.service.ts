import { Injectable, Logger } from '@nestjs/common';

import { ContractTemplateQueryService } from 'src/database/queries/contract-template.query';
import { ParseDocxService } from './parse-docx-service';

export interface ContractTemplateRecord {
  id: string;
  contractType: string;
  title: string | null;
  storageKey: string;
  mimeType: string;
  version: number;
  extractedHtml: string | null;
}

@Injectable()
export class ContractTemplateService {
  private readonly logger = new Logger(ContractTemplateService.name);

  constructor(
    private readonly contractTemplateQuery: ContractTemplateQueryService,
    private readonly parseDocxService: ParseDocxService,
  ) {}

  async createTemplate(params: {
    contractType: string;
    title?: string | null;
    storageKey: string;
    mimeType: string;
    extractedHtml?: string | null;
    version?: number;
    createdBy?: string | null;
    isActive?: boolean;
  }) {
    return this.contractTemplateQuery.upsertTemplate({
      contractType: params.contractType,
      title: params.title ?? null,
      storageKey: params.storageKey,
      mimeType: params.mimeType,
      extractedHtml: params.extractedHtml ?? null,
      createdBy: params.createdBy ?? null,
      version: params.version,
      isActive: params.isActive,
    });
  }

  async getActiveTemplate(contractType: string): Promise<ContractTemplateRecord | null> {
    let template = await this.contractTemplateQuery.getActiveTemplateByType(contractType);

    if (!template && contractType === 'unknown') {
      template =
        (await this.contractTemplateQuery.getActiveTemplateByType('nda')) ??
        (await this.contractTemplateQuery.getActiveTemplateByType('dpa')) ??
        null;
    }

    if (!template) return null;

    if (!template.extractedHtml) {
      try {
        const html = await this.parseDocxService.parseStorageKeyDocx(template.storageKey, template.mimeType);
        if (html) {
          await this.contractTemplateQuery.updateTemplateExtractedHtml(template.id, html);
          return { ...template, extractedHtml: html };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to generate HTML for template ${template.id}: ${(error as Error)?.message ?? error}`,
        );
      }
    }

    return template as ContractTemplateRecord;
  }
}
