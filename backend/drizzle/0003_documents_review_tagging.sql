ALTER TABLE "documents" ADD COLUMN "reviewed_fields" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tag_status" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tagging" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tag_failure_message" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "decision_s3_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "index_status" text;--> statement-breakpoint
CREATE INDEX "documents_index_status_idx" ON "documents" USING btree ("index_status");