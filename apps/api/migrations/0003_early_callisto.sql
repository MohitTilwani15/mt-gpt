CREATE TABLE "Memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"chatId" uuid,
	"messageId" uuid,
	"text" text NOT NULL,
	"embedding" vector(1536),
	"importance" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_user_id_idx" ON "Memory" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "memory_chat_id_idx" ON "Memory" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "memory_user_created_idx" ON "Memory" USING btree ("userId","createdAt");