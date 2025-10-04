CREATE TABLE "email_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"filename" text,
	"mime_type" text,
	"data" text
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text,
	"from_email" text,
	"to_email" text,
	"subject" text,
	"snippet" text,
	"body" text,
	"has_attachments" boolean,
	"received_at" timestamp,
	"direction" text
);
--> statement-breakpoint
CREATE TABLE "gmail_sync_state" (
	"user_email" text PRIMARY KEY NOT NULL,
	"last_history_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE no action ON UPDATE no action;