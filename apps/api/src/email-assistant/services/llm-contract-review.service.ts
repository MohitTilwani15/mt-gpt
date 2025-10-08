import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

import { ParseDocxService } from './parse-docx-service';
import { ChatModel } from 'src/chat/dto/chat.dto';
import { ContractTemplateService } from './contract-template.service';

export interface LlmContractReviewResult {
  summary: string;
  htmlDiff: string;
  issues: Array<{
    title: string;
    severity: 'low' | 'medium' | 'high';
    detail: string;
    recommendation: string;
  }>;
}

@Injectable()
export class LlmContractReviewService {
  private readonly logger = new Logger(LlmContractReviewService.name);

  constructor(
    private readonly parseDocxService: ParseDocxService,
    private readonly contractTemplateService: ContractTemplateService,
    private readonly configService: ConfigService,
  ) {}

  async compareWithStandard(params: {
    contractType: 'nda' | 'dpa' | 'unknown';
    incomingMessageId: string;
  }): Promise<LlmContractReviewResult | null> {
    const templateRecord = await this.contractTemplateService.getActiveTemplate(params.contractType);
    if (!templateRecord) {
      this.logger.warn(`No template configured for contract type ${params.contractType}.`);
      return null;
    }

    const [incomingHtml] = await Promise.all([
      this.parseDocxService.parseMessageDocx(params.incomingMessageId),
    ]);

    const standardHtml = templateRecord.extractedHtml;

    if (!standardHtml) {
      this.logger.warn(`Failed to load standard template HTML for contract type ${params.contractType}.`);
      return null;
    }

    if (!incomingHtml) {
      this.logger.warn(`Failed to load incoming contract HTML for message ${params.incomingMessageId}.`);
      return null;
    }

    const modelName = this.configService.get<string>('CONTRACT_REVIEW_MODEL') ?? ChatModel.GPT_5_NANO;

    const prompt = this.buildComparisonPrompt({
      contractType: params.contractType,
      standardHtml,
      incomingHtml,
    });

    try {
      const schema = z.object({
        summary: z.string(),
        htmlDiff: z.string().default(''),
        issues: z
          .array(
            z.object({
              title: z.string().default('Issue'),
              severity: z.enum(['low', 'medium', 'high']).default('low'),
              detail: z.string().default(''),
              recommendation: z.string().default(''),
            }),
          )
          .default([]),
      });

      const { object } = await generateObject({
        model: openai(modelName),
        schema,
        prompt,
        temperature: 0,
        maxOutputTokens: 2000,
      });

      return object;
    } catch (error) {
      this.logger.error(`LLM contract review failed: ${(error as Error)?.message ?? error}`);
      return null;
    }
  }

  private buildComparisonPrompt(params: {
    contractType: string;
    standardHtml: string;
    incomingHtml: string;
  }) {
    return `You are a senior contracts attorney. Compare the company's standard ${params.contractType.toUpperCase()} template to the received contract.
Produce a JSON response with the following shape:
{
  "summary": string,
  "issues": [
    {
      "title": string,
      "severity": "low" | "medium" | "high",
      "detail": string,
      "recommendation": string
    }
  ],
  "htmlDiff": string // HTML diff using <del> for removals and <ins> for insertions
}
Focus on material deviations, missing clauses, or riskier language. Keep the diff concise but accurate.

Standard template HTML:
${params.standardHtml}

Received contract HTML:
${params.incomingHtml}`;
  }
}
