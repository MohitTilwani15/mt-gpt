import { Injectable } from '@nestjs/common';

import { ContractPlaybookQueryService } from 'src/database/queries/contract-playbook.query';

export interface ContractPlaybookRecord {
  id: string;
  contractType: string;
  title: string | null;
  content: string;
  version: number;
  isActive: boolean;
}

@Injectable()
export class ContractPlaybookService {
  constructor(private readonly playbookQuery: ContractPlaybookQueryService) {}

  async upsertPlaybook(params: {
    contractType: string;
    title?: string | null;
    content: string;
    version?: number;
    createdBy?: string | null;
    isActive?: boolean;
  }): Promise<ContractPlaybookRecord> {
    const record = await this.playbookQuery.upsertPlaybook({
      contractType: params.contractType,
      title: params.title ?? null,
      content: params.content,
      version: params.version,
      createdBy: params.createdBy ?? null,
      isActive: params.isActive,
    });

    return {
      id: record.id,
      contractType: record.contractType,
      title: record.title,
      content: record.content,
      version: record.version,
      isActive: record.isActive,
    };
  }

  async getActivePlaybook(contractType: string): Promise<ContractPlaybookRecord | null> {
    let playbook = await this.playbookQuery.getActivePlaybookByType(contractType);

    if (!playbook && contractType === 'unknown') {
      playbook =
        (await this.playbookQuery.getActivePlaybookByType('nda')) ??
        (await this.playbookQuery.getActivePlaybookByType('dpa')) ??
        null;
    }

    if (!playbook) return null;

    return {
      id: playbook.id,
      contractType: playbook.contractType,
      title: playbook.title,
      content: playbook.content,
      version: playbook.version,
      isActive: playbook.isActive,
    };
  }
}
