import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { InsightCitation, InsightMessageRole, InsightMessageStatus, InsightSource } from "@lpl-hacks/shared/src/types/native/insight/insightMessage.js";
import { clients } from "./clients.js";
import { timestamps } from "./general.js";

export const insightConversations = pgTable("insight_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  advisorId: text("advisor_id").notNull(),
  ...timestamps,
}, (table) => [
  index("insight_conversations_client_id_idx").on(table.clientId, table.advisorId),
]);

export const insightMessages = pgTable("insight_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => insightConversations.id, { onDelete: "cascade" }),
  role: text("role").$type<InsightMessageRole>().notNull(),
  status: text("status").$type<InsightMessageStatus>().notNull(),
  text: text("text").notNull(),
  citations: jsonb("citations").$type<InsightCitation[]>().notNull().default([]),
  sources: jsonb("sources").$type<InsightSource[]>().notNull().default([]),
  failureMessage: text("failure_message"),
  ...timestamps,
}, (table) => [
  index("insight_messages_conversation_id_idx").on(table.conversationId, table.createdAt),
  uniqueIndex("insight_messages_one_open_answer_idx").on(table.conversationId).where(sql`${table.status} in ('pending', 'streaming')`),
]);
