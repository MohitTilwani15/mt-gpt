import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from 'src/database/database-connection';
import { databaseSchema } from 'src/database/schemas';

const { contractTemplates } = databaseSchema;

type ContractTemplateRecord = typeof contractTemplates.$inferSelect;

@Injectable()
export class ContractTemplateQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async upsertTemplate(template: {
    contractType: string;
    title?: string | null;
    storageKey: string;
    mimeType: string;
    extractedHtml?: string | null;
    createdBy?: string | null;
    version?: number;
    isActive?: boolean;
  }): Promise<ContractTemplateRecord> {
    const version = template.version ?? 1;
    const isActive = template.isActive ?? true;

    return this.db.transaction(async (tx) => {
      if (isActive) {
        await tx
          .update(contractTemplates)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contractTemplates.contractType, template.contractType),
              eq(contractTemplates.isActive, true),
            ),
          );
      }

      const [row] = await tx
        .insert(contractTemplates)
        .values({
          contractType: template.contractType,
          title: template.title ?? null,
          storageKey: template.storageKey,
          mimeType: template.mimeType,
          extractedHtml: template.extractedHtml ?? null,
          createdBy: template.createdBy ?? null,
          version,
          isActive,
        })
        .returning();

      return row;
    });
  }

  async updateTemplateExtractedHtml(templateId: string, html: string): Promise<void> {
    await this.db
      .update(contractTemplates)
      .set({ extractedHtml: html, updatedAt: new Date() })
      .where(eq(contractTemplates.id, templateId));
  }

  async getActiveTemplateByType(contractType: string): Promise<ContractTemplateRecord | null> {
    const [template] = await this.db
      .select()
      .from(contractTemplates)
      .where(
        and(
          eq(contractTemplates.contractType, contractType),
          eq(contractTemplates.isActive, true),
        ),
      )
      .orderBy(desc(contractTemplates.version))
      .limit(1);

    return template ?? null;
  }
}
