import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Paragraph, TextRun, Document, Packer } from 'docx';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { extractText, getDocumentProxy } from 'unpdf';
import * as mammoth from 'mammoth';

import { EmailAssistantQueryService } from 'src/database/queries/email-assistant.query';
import { ContractReviewJobPayload } from 'src/queue/jobs';
import { ChatModel } from 'src/chat/dto/chat.dto';

interface ContractReviewResult {
  summary: string;
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

    const classifiedType = await this.determineContractType(extractedText ?? '', payload.contractType);

    const summaryLines = [
      `Automated ${classifiedType.toUpperCase()} review for message ${payload.messageId}.`,
      `Sender: ${payload.senderEmail}`,
      `Subject: ${payload.subject}`,
      `Primary document: ${primaryAttachment.filename ?? 'unknown'}.`,
      '',
      'Placeholder feedback:',
      '- Differences identified compared to the company template should be reviewed manually.',
      '- Clauses requiring legal attention will be highlighted here in future iterations.',
      '- This automated response is for testing purposes only.',
    ];

    const summary = summaryLines.join('\n');

    const docBuffer = await this.generatePlaceholderDoc({
      summaryLines,
      attachmentName: primaryAttachment.filename ?? 'contract',
      contractType: classifiedType,
    });

    return {
      summary,
      attachment: {
        filename: `Review-${classifiedType}-${Date.now()}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: docBuffer.toString('base64'),
      },
    };
  }

  private async generatePlaceholderDoc(params: {
    summaryLines: string[];
    attachmentName: string;
    contractType: ContractReviewJobPayload['contractType'];
  }) {
    const { summaryLines, attachmentName, contractType } = params;

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: `Automated ${contractType.toUpperCase()} Review`,
                  bold: true,
                  size: 28,
                }),
              ],
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({ text: `Reviewed document: ${attachmentName}`, italics: true }),
              ],
            }),
            ...summaryLines.map(
              (line) =>
                new Paragraph({
                  children: [new TextRun({ text: line, size: 24 })],
                }),
            ),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return Buffer.from(buffer);
  }

  private async extractTextFromAttachment(buffer: Buffer, mimeType: string): Promise<string | null> {
    try {
      if (mimeType?.includes('pdf')) {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        return text ?? null;
      }

      if (mimeType?.includes('wordprocessingml.document') || mimeType?.includes('application/vnd.openxmlformats-officedocument')) {
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

  private async determineContractType(text: string, fallback: ContractReviewJobPayload['contractType']) {
    if (!text || text.trim().length === 0) {
      return fallback;
    }

    const trimmed = text.slice(0, 6000);
    try {
      const modelName = this.configService.get<string>('CONTRACT_CLASSIFIER_MODEL') ?? ChatModel.GPT_5_NANO;
      const response = await generateText({
        model: openai(modelName),
        prompt: `Classify the following contract as "nda", "dpa", or "unknown".
Return only one word: nda, dpa, or unknown.

Contract text:
${trimmed}`,
        temperature: 0,
      });

      const prediction = response.text.trim().toLowerCase();
      if (prediction.includes('dpa')) return 'dpa';
      if (prediction.includes('nda')) return 'nda';
      if (prediction.includes('unknown')) return 'unknown';
    } catch (error) {
      this.logger.warn(`Contract classification failed: ${(error as Error)?.message ?? error}`);
    }

    return fallback;
  }
}
