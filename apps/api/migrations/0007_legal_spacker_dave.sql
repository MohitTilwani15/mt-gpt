CREATE TABLE "Assistant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ownerId" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"instructions" text,
	"defaultModel" varchar(120),
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AssistantKnowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assistantId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"fileKey" varchar(500) NOT NULL,
	"fileSize" integer,
	"mimeType" varchar(100) NOT NULL,
	"text" text,
	"embedding" vector(1536),
	"uploadedBy" text
);
--> statement-breakpoint
CREATE TABLE "AssistantShare" (
	"assistantId" uuid NOT NULL,
	"userId" text NOT NULL,
	"canManage" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "AssistantShare_assistantId_userId_pk" PRIMARY KEY("assistantId","userId")
);
--> statement-breakpoint
ALTER TABLE "Chat" ADD COLUMN "assistantId" uuid;--> statement-breakpoint
ALTER TABLE "Assistant" ADD CONSTRAINT "Assistant_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AssistantKnowledge" ADD CONSTRAINT "AssistantKnowledge_assistantId_Assistant_id_fk" FOREIGN KEY ("assistantId") REFERENCES "public"."Assistant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AssistantKnowledge" ADD CONSTRAINT "AssistantKnowledge_uploadedBy_user_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AssistantShare" ADD CONSTRAINT "AssistantShare_assistantId_Assistant_id_fk" FOREIGN KEY ("assistantId") REFERENCES "public"."Assistant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "AssistantShare" ADD CONSTRAINT "AssistantShare_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_assistantId_Assistant_id_fk" FOREIGN KEY ("assistantId") REFERENCES "public"."Assistant"("id") ON DELETE set null ON UPDATE no action;