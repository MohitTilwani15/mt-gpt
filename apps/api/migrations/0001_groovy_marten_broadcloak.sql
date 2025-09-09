CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"messageId" uuid,
	"fileName" varchar(255) NOT NULL,
	"fileKey" varchar(500) NOT NULL,
	"fileSize" integer NOT NULL,
	"mimeType" varchar(100) NOT NULL,
	"text" text,
	"embedding" vector(1536),
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"role" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"messageId" uuid NOT NULL,
	"type" varchar NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"text_text" text,
	"reasoning_text" text,
	"file_mediaType" varchar,
	"file_filename" varchar,
	"file_url" varchar,
	"source_url_sourceId" varchar,
	"source_url_url" varchar,
	"source_url_title" varchar,
	"source_document_sourceId" varchar,
	"source_document_mediaType" varchar,
	"source_document_title" varchar,
	"source_document_filename" varchar,
	"providerMetadata" jsonb,
	CONSTRAINT "text_text_required_if_type_is_text" CHECK (CASE WHEN "parts"."type" = 'text' THEN "parts"."text_text" IS NOT NULL ELSE TRUE END),
	CONSTRAINT "reasoning_text_required_if_type_is_reasoning" CHECK (CASE WHEN "parts"."type" = 'reasoning' THEN "parts"."reasoning_text" IS NOT NULL ELSE TRUE END),
	CONSTRAINT "file_fields_required_if_type_is_file" CHECK (CASE WHEN "parts"."type" = 'file' THEN "parts"."file_mediaType" IS NOT NULL AND "parts"."file_url" IS NOT NULL ELSE TRUE END),
	CONSTRAINT "source_url_fields_required_if_type_is_source_url" CHECK (CASE WHEN "parts"."type" = 'source_url' THEN "parts"."source_url_sourceId" IS NOT NULL AND "parts"."source_url_url" IS NOT NULL ELSE TRUE END),
	CONSTRAINT "source_document_fields_required_if_type_is_source_document" CHECK (CASE WHEN "parts"."type" = 'source_document' THEN "parts"."source_document_sourceId" IS NOT NULL AND "parts"."source_document_mediaType" IS NOT NULL AND "parts"."source_document_title" IS NOT NULL ELSE TRUE END)
);
--> statement-breakpoint
CREATE TABLE "Vote" (
	"chatId" uuid NOT NULL,
	"messageId" uuid NOT NULL,
	"isUpvoted" boolean NOT NULL,
	CONSTRAINT "Vote_chatId_messageId_pk" PRIMARY KEY("chatId","messageId")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_chat_id_idx" ON "Message" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX "messages_chat_id_created_at_idx" ON "Message" USING btree ("chatId","createdAt");--> statement-breakpoint
CREATE INDEX "parts_message_id_idx" ON "parts" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "parts_message_id_order_idx" ON "parts" USING btree ("messageId","order");