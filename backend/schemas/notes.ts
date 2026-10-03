import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { NoteColor } from "@lpl-hacks/shared/src/types/native/notes/note.js";
import { clientMembers, clients } from "./clients.js";
import { timestamps } from "./general.js";

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => clientMembers.id, { onDelete: "set null" }),
  advisorId: text("advisor_id").notNull(),
  title: text("title").notNull(),
  html: text("html").notNull(),
  text: text("text").notNull(),
  color: text("color").$type<NoteColor>().notNull(),
  ...timestamps,
}, (table) => [
  index("notes_client_id_idx").on(table.clientId),
]);
