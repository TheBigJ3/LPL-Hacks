import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { DocumentStatus } from "@lpl-hacks/shared/src/types/native/documents/document.js";
import type { DocumentReviewField } from "@lpl-hacks/shared/src/types/native/documents/documentReview.js";
import type { DocumentIndexStatus, DocumentTagging, DocumentTagStatus } from "@lpl-hacks/shared/src/types/native/documents/documentTagging.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import { clients } from "./clients.js";
import { timestamps } from "./general.js";
import { uploadRequests } from "./uploadRequests.js";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  s3Key: text("s3_key").notNull(),
  status: text("status").$type<DocumentStatus>().notNull().default("uploaded"),
  pageCount: integer("page_count"),
  extraction: jsonb("extraction").$type<ExtractedAnalysis>(),
  failureMessage: text("failure_message"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  uploadRequestId: uuid("upload_request_id").references(() => uploadRequests.id, { onDelete: "set null" }),
  reviewedFields: jsonb("reviewed_fields").$type<Record<string, DocumentReviewField>>(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  tagStatus: text("tag_status").$type<DocumentTagStatus>(),
  tagging: jsonb("tagging").$type<DocumentTagging>(),
  tagFailureMessage: text("tag_failure_message"),
  decisionS3Key: text("decision_s3_key"),
  indexStatus: text("index_status").$type<DocumentIndexStatus>(),
  ...timestamps,
}, (table) => [
  index("documents_client_id_idx").on(table.clientId),
  index("documents_upload_request_id_idx").on(table.uploadRequestId),
  index("documents_index_status_idx").on(table.indexStatus),
]);
