import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { UploadRequestStatus } from "@lpl-hacks/shared/src/types/native/uploadRequests/uploadRequest.js";
import { clients } from "./clients.js";
import { timestamps } from "./general.js";

export const uploadRequests = pgTable("upload_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  advisorId: text("advisor_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  token: text("token").notNull().unique(),
  note: text("note"),
  status: text("status").$type<UploadRequestStatus>().notNull().default("open"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("upload_requests_client_id_idx").on(table.clientId),
]);
