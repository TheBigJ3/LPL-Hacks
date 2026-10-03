import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ClientKind } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import { timestamps } from "./general.js";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  advisorId: text("advisor_id").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  kind: text("kind").$type<ClientKind>().notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("clients_advisor_id_slug_idx").on(table.advisorId, table.slug),
]);

export const clientMembers = pgTable("client_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("client_members_client_id_slug_idx").on(table.clientId, table.slug),
]);
