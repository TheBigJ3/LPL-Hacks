-- Extraction runs on Textract's sync API, so there is no async job id to keep.
ALTER TABLE "documents" DROP COLUMN "textract_job_id";
