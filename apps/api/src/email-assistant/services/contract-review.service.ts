import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { extractText, getDocumentProxy } from 'unpdf';
import * as mammoth from 'mammoth';
import { z } from 'zod';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';
import { ContractReviewJobPayload } from 'src/queue/jobs';
import { ChatModel } from 'src/chat/dto/chat.dto';
import { LlmContractReviewService } from './llm-contract-review.service';
import { DocxRedlineService } from './docx-redline.service';

interface ContractReviewResult {
  summary: string[];
  attachment?: {
    filename: string;
    mimeType: string;
    data: string; // base64
  };
}

@Injectable()
export class ContractReviewService {
  private readonly logger = new Logger(ContractReviewService.name);

  constructor(
    private readonly emailAssistantQuery: EmailAssistantQueryService,
    private readonly configService: ConfigService,
    private readonly llmContractReviewService: LlmContractReviewService,
    private readonly docxRedlineService: DocxRedlineService,
  ) {}

  async reviewContract(payload: ContractReviewJobPayload): Promise<ContractReviewResult | null> {
    const attachments = await this.emailAssistantQuery.getMessageAttachments(payload.messageId);

    if (!attachments.length) {
      this.logger.warn(`No attachments found for message ${payload.messageId}; skipping contract review.`);
      return null;
    }

    const primaryAttachment = attachments[0];
    const buffer = Buffer.from(primaryAttachment.data, 'base64');
    const extractedText = await this.extractTextFromAttachment(buffer, primaryAttachment.mimeType ?? '');

    const classifiedType = await this.determineContractType(extractedText ?? '', 'unknown');

    const llmReview = await this.llmContractReviewService.compareWithStandard({
      contractType: classifiedType,
      incomingMessageId: payload.messageId,
    });

    if (llmReview) {
      // const attachment = await this.docxRedlineService.buildAttachment({
      //   review: llmReview,
      //   metadata: {
      //     contractType: classifiedType,
      //     messageId: payload.messageId,
      //     subject: payload.subject,
      //   },
      // });

      return {
        summary: llmReview.summary,
        // attachment,
      };
    }

    this.logger.warn(
      `LLM contract review produced no result for message ${payload.messageId}; skipping response generation.`,
    );
    return null;
  }

  private async extractTextFromAttachment(buffer: Buffer, mimeType: string): Promise<string | null> {
    try {
      if (mimeType?.includes('pdf')) {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        return text ?? null;
      }

      if (
        mimeType?.includes('wordprocessingml.document') ||
        mimeType?.includes('application/vnd.openxmlformats-officedocument') ||
        mimeType === 'application/msword'
      ) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value ?? null;
      }

      if (mimeType?.startsWith('text/')) {
        return buffer.toString('utf8');
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to extract text for mimeType ${mimeType}: ${(error as Error)?.message ?? error}`);
      return null;
    }
  }

  private async determineContractType(text: string, fallback: 'nda' | 'dpa' | 'unknown') {
    if (!text || text.trim().length === 0) {
      return fallback;
    }

    const trimmed = text.slice(0, 6000);
    try {
      const modelName = this.configService.get<string>('CONTRACT_CLASSIFIER_MODEL') ?? ChatModel.GPT_5;
      const schema = z.object({
        contractType: z.enum(['nda', 'dpa', 'unknown']).default('unknown'),
      });

      const { object } = await generateObject({
        model: openai(modelName),
        schema,
        prompt: `Classify the following contract as one of: nda, dpa, unknown.
Respond only with the JSON field "contractType".

Contract text:
${trimmed}`,
        maxOutputTokens: 200,
      });

      if (object?.contractType) {
        return object.contractType;
      }
    } catch (error) {
      this.logger.warn(`Contract classification failed: ${(error as Error)?.message ?? error}`);
    }

    return fallback;
  }
}
