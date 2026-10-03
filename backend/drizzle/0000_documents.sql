CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"s3_key" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"textract_job_id" text,
	"page_count" integer,
	"extraction" jsonb,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
