import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

import { TenantQueryService } from 'src/database/queries/tenant.query';
import type { UserSession } from '@mguay/nestjs-better-auth';

export interface TenantContext {
  tenantId: string;
  role: string;
}

const TENANT_HEADER = 'x-tenant-id';

@Injectable()
export class TenantService {
  constructor(
    private readonly tenantQueryService: TenantQueryService,
  ) {}

  async resolveTenantContext(session: UserSession, request: Request): Promise<TenantContext> {
    if (!session?.user?.id) {
      throw new ForbiddenException('Unauthorized');
    }

    const tenantId = this.extractTenantId(request);
    const userId = session.user.id;

    if (tenantId) {
      const membership = await this.tenantQueryService.getMembership(tenantId, userId);
      if (!membership) {
        throw new ForbiddenException('You do not have access to this workspace');
      }

      this.assignTenant(request, membership.tenant.id, membership.membership.role);
      return { tenantId: membership.tenant.id, role: membership.membership.role };
    }

    const membership = await this.tenantQueryService.ensureTenantForUser(userId);
    if (!membership?.tenantId) {
      throw new NotFoundException('Unable to determine workspace');
    }

    const hydrated = await this.tenantQueryService.getMembership(membership.tenantId, userId);
    if (!hydrated) {
      throw new NotFoundException('Unable to load workspace membership');
    }

    this.assignTenant(request, hydrated.tenant.id, hydrated.membership.role);
    return {
      tenantId: hydrated.tenant.id,
      role: hydrated.membership.role,
    };
  }

  async setTenant(session: UserSession, tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (!session?.user?.id) {
      throw new ForbiddenException('Unauthorized');
    }

    const membership = await this.tenantQueryService.getMembership(tenantId, session.user.id);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this workspace');
    }

    await this.tenantQueryService.setTenantForUser(session.user.id, tenantId);

    return {
      tenantId,
      role: membership.membership.role,
    };
  }

  private extractTenantId(request: Request): string | null {
    const headerValue = request.headers[TENANT_HEADER];
    if (Array.isArray(headerValue)) {
      return headerValue[0] ?? null;
    }
    if (typeof headerValue === 'string' && headerValue.trim()) {
      return headerValue.trim();
    }

    if (typeof request.query?.tenantId === 'string') {
      return request.query.tenantId;
    }

    return null;
  }

  private assignTenant(request: Request, tenantId: string, role: string | null = null) {
    Object.assign(request, {
      tenantContext: {
        tenantId,
        role,
      },
    });
  }
}
