import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';

import { ContractTemplateService } from '../services/contract-template.service';
import { ContractTextExtractionService } from '../services/contract-text-extraction.service';
import { CloudflareR2Service } from 'src/services/cloudflare-r2.service';

const ALLOWED_CONTRACT_TYPES = ['nda', 'dpa'] as const;

const contractTypeSchema = z.enum(ALLOWED_CONTRACT_TYPES);
type ContractType = z.infer<typeof contractTypeSchema>;

const uploadSchema = z.object({
  contractType: z
    .string()
    .trim()
    .transform((type) => type.toLowerCase())
    .pipe(contractTypeSchema),
  title: z.string().optional(),
  version: z.coerce.number().int().positive().optional(),
});

type UploadTemplateRequest = z.input<typeof uploadSchema>;
type UploadTemplatePayload = z.infer<typeof uploadSchema>;

type UploadTemplateResponse = {
  id: string;
  contractType: ContractType;
  title: string | null;
  version: number;
  storageKey: string;
  uploadedUrl: string;
};

@Controller('contract-templates')
export class ContractTemplateController {
  constructor(
    private readonly templateService: ContractTemplateService,
    private readonly parseDocxService: ContractTextExtractionService,
    private readonly r2Service: CloudflareR2Service,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadTemplate(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadTemplateRequest,
  ): Promise<UploadTemplateResponse> {
    if (!file) {
      throw new BadRequestException('Missing template file');
    }

    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const payload: UploadTemplatePayload = parsed.data;

    const upload = await this.r2Service.uploadFile({ file });
    const extractedHtml = await this.parseDocxService.parseDocxToHtml(file.buffer);

    const template = await this.templateService.createTemplate({
      contractType: payload.contractType,
      title: payload.title ?? file.originalname,
      storageKey: upload.key,
      mimeType: file.mimetype,
      extractedHtml: extractedHtml ?? null,
      version: payload.version,
    });

    return {
      id: template.id,
      contractType: template.contractType as ContractType,
      title: template.title,
      version: template.version,
      storageKey: template.storageKey,
      uploadedUrl: upload.url,
    };
  }
}
