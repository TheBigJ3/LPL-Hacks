import { integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { DocumentStatus } from "@lpl-hacks/shared/src/types/native/documents/document.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import { timestamps } from "./general.js";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  s3Key: text("s3_key").notNull(),
  status: text("status").$type<DocumentStatus>().notNull().default("uploaded"),
  textractJobId: text("textract_job_id"),
  pageCount: integer("page_count"),
  extraction: jsonb("extraction").$type<ExtractedAnalysis>(),
  failureMessage: text("failure_message"),
  ...timestamps,
});
