import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

import { ContractTextExtractionService } from './contract-text-extraction.service';
import { ChatModel } from 'src/chat/dto/chat.dto';
import { ContractPlaybookService } from './contract-playbook.service';

export interface LlmContractReviewResult {
  summary: string[];
}

@Injectable()
export class LlmContractReviewService {
  private readonly logger = new Logger(LlmContractReviewService.name);

  constructor(
    private readonly parseDocxService: ContractTextExtractionService,
    private readonly contractPlaybookService: ContractPlaybookService,
    private readonly configService: ConfigService,
  ) {}

  async compareWithStandard(params: {
    contractType: 'nda' | 'dpa' | 'unknown';
    incomingMessageId: string;
  }): Promise<LlmContractReviewResult | null> {
    const playbookRecord = await this.contractPlaybookService.getActivePlaybook(params.contractType);
    if (!playbookRecord) {
      this.logger.warn(`No playbook configured for contract type ${params.contractType}.`);
      return null;
    }

    const [incomingText] = await Promise.all([
      this.parseDocxService.parseMessageDocxText(params.incomingMessageId),
    ]);

    if (!incomingText) {
      this.logger.warn(`Failed to load incoming contract text for message ${params.incomingMessageId}.`);
      return null;
    }

    const modelName = this.configService.get<string>('CONTRACT_REVIEW_MODEL') ?? ChatModel.GPT_5_NANO;

    const prompt = this.buildPlaybookPrompt({
      contractType: params.contractType,
      playbookMarkdown: playbookRecord.content,
      incomingText,
    });

    try {
      const schema = z.object({
        summary: z.union([z.string(), z.array(z.string())]).optional()
      });

      const { object } = await generateObject({
        model: openai(modelName),
        schema,
        prompt,
      });

      const summary = this.normalizeSummary(object.summary);

      return {
        summary,
      };
    } catch (error) {
      this.logger.error(`LLM contract review failed: ${(error as Error)?.message ?? error}`);
      return null;
    }
  }

  private buildPlaybookPrompt(params: {
    contractType: string;
    playbookMarkdown: string;
    incomingText: string;
  }) {
    const truncatedContract = params.incomingText.slice(0, 15000);

    return `You are a senior contracts attorney. Review the provided ${params.contractType.toUpperCase()} contract against the playbook guidance below. Highlight deviations, missing protections, and risky language relative to the playbook expectations. Focus on producing a concise summary.
Produce a JSON response with the following shape:
{
  "summary": string[], // concise bullet points summarizing key findings
}
Focus on the most material gaps between the contract and the playbook. Keep the diff concise but ensure it cleanly applies to the provided contract text (if provided).

Playbook (Markdown):
${params.playbookMarkdown}

Received contract text:
${truncatedContract}`;
  }

  private normalizeSummary(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw
        .map((line) => (typeof line === 'string' ? line.trim() : ''))
        .filter((line) => line.length > 0);
    }

    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    return [];
  }
}
