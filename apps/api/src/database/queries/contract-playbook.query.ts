import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from 'src/database/database-connection';
import { databaseSchema } from 'src/database/schemas';

const { contractPlaybooks } = databaseSchema;

type ContractPlaybookRecord = typeof contractPlaybooks.$inferSelect;

@Injectable()
export class ContractPlaybookQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async upsertPlaybook(playbook: {
    contractType: string;
    title?: string | null;
    content: string;
    createdBy?: string | null;
    version?: number;
    isActive?: boolean;
  }): Promise<ContractPlaybookRecord> {
    const version = playbook.version ?? 1;
    const isActive = playbook.isActive ?? true;

    return this.db.transaction(async (tx) => {
      if (isActive) {
        await tx
          .update(contractPlaybooks)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(contractPlaybooks.contractType, playbook.contractType),
              eq(contractPlaybooks.isActive, true),
            ),
          );
      }

      const [row] = await tx
        .insert(contractPlaybooks)
        .values({
          contractType: playbook.contractType,
          title: playbook.title ?? null,
          content: playbook.content,
          createdBy: playbook.createdBy ?? null,
          version,
          isActive,
        })
        .returning();

      return row;
    });
  }

  async getActivePlaybookByType(contractType: string): Promise<ContractPlaybookRecord | null> {
    const [record] = await this.db
      .select()
      .from(contractPlaybooks)
      .where(
        and(
          eq(contractPlaybooks.contractType, contractType),
          eq(contractPlaybooks.isActive, true),
        ),
      )
      .orderBy(desc(contractPlaybooks.version))
      .limit(1);

    return record ?? null;
  }
}
