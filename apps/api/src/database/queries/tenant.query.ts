import { Injectable, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';

const {
  tenant,
  tenantMembership,
  user,
} = databaseSchema;

@Injectable()
export class TenantQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async getMembership(tenantId: string, userId: string) {
    return this.db
      .select({
        tenant,
        membership: tenantMembership,
      })
      .from(tenantMembership)
      .innerJoin(tenant, eq(tenantMembership.tenantId, tenant.id))
      .where(
        and(
          eq(tenantMembership.userId, userId),
          eq(tenantMembership.tenantId, tenantId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async ensureTenantForUser(userId: string) {
    const existingMemberships = await this.db
      .select()
      .from(tenantMembership)
      .where(eq(tenantMembership.userId, userId))
      .limit(1);

    if (existingMemberships.length > 0) {
      return existingMemberships[0];
    }

    const [userRecord] = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!userRecord) {
      throw new Error(`User ${userId} not found`);
    }

    const displayName = userRecord.name?.trim() || userRecord.email || 'Workspace';

    return this.db.transaction(async (tx) => {
      let tenantId = userRecord.tenantId;

      if (!tenantId) {
        const [newTenant] = await tx
          .insert(tenant)
          .values({
            name: `${displayName}'s Workspace`,
            slug: `tenant-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${userId.slice(0, 8)}`,
          })
          .returning({ id: tenant.id });

        tenantId = newTenant.id;

        await tx
          .update(user)
          .set({ tenantId })
          .where(eq(user.id, userId));
      }

      const [membershipRow] = await tx
        .insert(tenantMembership)
        .values({
          tenantId,
          userId,
          role: 'owner',
        })
        .onConflictDoNothing()
        .returning();

      if (membershipRow) {
        return membershipRow;
      }

      const [existing] = await tx
        .select()
        .from(tenantMembership)
        .where(
          and(
            eq(tenantMembership.tenantId, tenantId),
            eq(tenantMembership.userId, userId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new Error('Failed to create tenant membership');
      }

      return existing;
    });
  }

  async setTenantForUser(userId: string, tenantId: string) {
    await this.db
      .update(user)
      .set({ tenantId })
      .where(eq(user.id, userId));
  }

  async getUserTenantId(userId: string) {
    const [row] = await this.db
      .select({ tenantId: user.tenantId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    return row?.tenantId ?? null;
  }
}
