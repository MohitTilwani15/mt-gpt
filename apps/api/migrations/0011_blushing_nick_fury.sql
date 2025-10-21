CREATE TYPE "public"."tenant_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TABLE "Tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "TenantMembership" (
	"tenantId" uuid NOT NULL,
	"userId" text NOT NULL,
	"role" "tenant_role" DEFAULT 'member' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "TenantMembership_tenantId_userId_pk" PRIMARY KEY("tenantId","userId")
);
--> statement-breakpoint
ALTER TABLE "Assistant" ADD COLUMN "tenantId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "AssistantKnowledge" ADD COLUMN "tenantId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "AssistantShare" ADD COLUMN "tenantId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "tenantId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "Document" ADD COLUMN "tenantId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "Memory" ADD COLUMN "tenantId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AssistantKnowledge" ADD CONSTRAINT "AssistantKnowledge_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AssistantShare" ADD CONSTRAINT "AssistantShare_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_Tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_tenantId_Tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE cascade ON UPDATE no action;