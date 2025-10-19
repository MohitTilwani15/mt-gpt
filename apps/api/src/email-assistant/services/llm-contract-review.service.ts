import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

import { ContractTextExtractionService } from './contract-text-extraction.service';
import { ChatModel } from 'src/chat/dto/chat.dto';
import { ContractPlaybookService } from './contract-playbook.service';
import { ContractRedlineOperation } from 'src/queue/jobs';

export interface LlmContractReviewResult {
  summary: string[];
  redlines: ContractRedlineOperation[];
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
        summary: z.union([z.string(), z.array(z.string())]).optional(),
        redlines: z
          .array(
            z.discriminatedUnion('type', [
              z.object({
                type: z.literal('delete'),
                text: z.string().min(1),
                rationale: z.string().optional(),
              }),
              z.object({
                type: z.literal('insert'),
                anchor: z.string().min(1),
                text: z.string().min(1),
                rationale: z.string().optional(),
              }),
            ]),
          )
          .optional(),
      });

      const { object } = await generateObject({
        model: openai(modelName),
        schema,
        prompt,
      });

      const summary = this.normalizeSummary(object.summary);
      const redlines = this.normalizeRedlines(object.redlines);

      return { summary, redlines };
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

    return `You are a senior contracts attorney. Review the provided ${params.contractType.toUpperCase()} contract against the playbook guidance below. Highlight deviations, missing protections, and risky language relative to the playbook expectations. Focus on producing a concise summary and actionable tracked-change instructions.
Produce a JSON response with the following shape:
{
  "summary": string[], // concise bullet points summarizing key findings
  "redlines": [
    {
      "type": "delete",
      "text": string, // exact text that should be deleted
      "rationale": string? // optional short explanation
    } | {
      "type": "insert",
      "anchor": string, // existing text after which the insertion should be applied
      "text": string,   // text to insert
      "rationale": string? // optional short explanation
    }
  ]
}
When providing delete operations, quote the exact text snippet to remove.
When providing insert operations, choose a short anchor snippet that clearly appears in the contract and specify the text that should be inserted immediately after it.
Keep the instructions concise and actionable. Provide at most 10 redline items focusing on the most material gaps between the contract and the playbook.

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

  private normalizeRedlines(raw: unknown): ContractRedlineOperation[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const operations: ContractRedlineOperation[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const type = (item as { type?: string }).type;
      if (type === 'delete' && typeof (item as { text?: unknown }).text === 'string') {
        operations.push({
          type: 'delete',
          text: (item as { text: string }).text.trim(),
          rationale:
            typeof (item as { rationale?: unknown }).rationale === 'string'
              ? (item as { rationale: string }).rationale.trim()
              : undefined,
        });
      } else if (
        type === 'insert' &&
        typeof (item as { anchor?: unknown }).anchor === 'string' &&
        typeof (item as { text?: unknown }).text === 'string'
      ) {
        operations.push({
          type: 'insert',
          anchor: (item as { anchor: string }).anchor.trim(),
          text: (item as { text: string }).text.trim(),
          rationale:
            typeof (item as { rationale?: unknown }).rationale === 'string'
              ? (item as { rationale: string }).rationale.trim()
              : undefined,
        });
      }
    }

    return operations.filter((op) =>
      op.type === 'delete' ? op.text.length > 0 : op.anchor.length > 0 && op.text.length > 0,
    );
  }
}
