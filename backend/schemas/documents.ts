import { customType, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { DocumentStatus } from "@lpl-hacks/shared/src/types/native/documents/document.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import { timestamps } from "./general.js";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  content: bytea("content").notNull(),
  status: text("status").$type<DocumentStatus>().notNull().default("uploaded"),
  pageCount: integer("page_count"),
  extraction: jsonb("extraction").$type<ExtractedAnalysis>(),
  failureMessage: text("failure_message"),
  ...timestamps,
});
