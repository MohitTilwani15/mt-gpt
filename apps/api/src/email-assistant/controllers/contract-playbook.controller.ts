import { BadRequestException, Body, Controller, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { ContractPlaybookService } from '../services/contract-playbook.service';

const contractTypeSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toLowerCase());

const upsertSchema = z.object({
  contractType: contractTypeSchema,
  title: z.string().optional(),
  content: z.string().min(1, 'content must not be empty'),
  version: z.coerce.number().int().positive().optional(),
  isActive: z.coerce.boolean().optional(),
  createdBy: z.string().optional(),
});

type UpsertRequest = z.input<typeof upsertSchema>;
type UpsertPayload = z.output<typeof upsertSchema>;

@Controller('contract-playbooks')
export class ContractPlaybookController {
  constructor(private readonly playbookService: ContractPlaybookService) {}

  @Post()
  @Put()
  async upsertPlaybook(@Body() body: UpsertRequest) {
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }

    const payload: UpsertPayload = parsed.data;
    const record = await this.playbookService.upsertPlaybook({
      contractType: payload.contractType,
      title: payload.title,
      content: payload.content,
      version: payload.version,
      isActive: payload.isActive,
      createdBy: payload.createdBy,
    });

    return {
      id: record.id,
      contractType: record.contractType,
      title: record.title,
      version: record.version,
      isActive: record.isActive,
    };
  }
}
