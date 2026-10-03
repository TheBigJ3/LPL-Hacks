-- Uploads now live in Postgres instead of S3. Rows from before this have no stored file; the default only lets the column be added.
ALTER TABLE "documents" ADD COLUMN "content" bytea DEFAULT ''::bytea NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "content" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "s3_key";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "textract_job_id";
