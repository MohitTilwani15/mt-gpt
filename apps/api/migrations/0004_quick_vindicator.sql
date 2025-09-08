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
CREATE TABLE "MessageDocument" (
	"messageId" uuid NOT NULL,
	"documentId" uuid NOT NULL,
	CONSTRAINT "MessageDocument_messageId_documentId_pk" PRIMARY KEY("messageId","documentId")
);
--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MessageDocument" ADD CONSTRAINT "MessageDocument_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "MessageDocument" ADD CONSTRAINT "MessageDocument_documentId_Document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE no action;