# Multi-Tenancy Overview

The application now supports isolated, multi-tenant workspaces. Every user belongs to at least one tenant and all chat, assistant, document, and memory operations are scoped by `tenantId`.

## Data Model Changes

- Added `Tenant` and `TenantMembership` tables for workspace metadata and role-based access.
- Most existing entities gained a `tenantId` column (for example `Chat`, `Document`, `Assistant`, `AssistantKnowledge`, `Memory`).
- Users carry a `tenantId` reference so the backend always knows which workspace to use when a request does not specify one explicitly.

Existing data is migrated so each user receives a dedicated tenant and becomes its owner.

## Background Jobs

- File processing jobs now carry a `tenantId` and processors validate the workspace before mutating data.
- Future jobs should follow the same pattern; include `tenantId` in payloads when enqueuing work.

## Migration

Run the new Drizzle migration (`0011_multi_tenant_base.sql`) after deploying the updated schema. The script:

1. Creates tenant tables and enums.
2. Backfills a tenant per existing user and links chats, documents, assistants, and memories.
3. Seeds tenant memberships and attaches each user to their tenant.

> **Note**: Verify environment variables for auxiliary services (Mem0, Cloudflare R2, etc.) still work once headers are enforced, as requests now include workspace context.
