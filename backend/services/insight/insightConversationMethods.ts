import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { InsightConversation, InsightConversationSummary, InsightMessage } from "@lpl-hacks/shared/src/types/native/insight/insightMessage.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import { isUniqueViolation } from "../../modules/pgError.js";
import requireSettings from "../../modules/requireSettings.js";
import { clients } from "../../schemas/clients.js";
import { insightConversations, insightMessages } from "../../schemas/insight.js";
import { CLIENT_ERRORS } from "../../types/native/clients/errors.js";
import { INSIGHT_ERRORS } from "../../types/native/insight/errors.js";

const { STALE_ANSWER_MS, LIST_LIMIT, TITLE_MAX_CHARS } = requireSettings("INSIGHT");

type InsightMessageRecord = typeof insightMessages.$inferSelect;

export type InsightAskResult = {
  conversationId: string;
  messages: InsightMessage[];
};

export function insightMessageToView(record: InsightMessageRecord): InsightMessage {
  return {
    id: record.id,
    conversationId: record.conversationId,
    role: record.role,
    status: record.status,
    text: record.text,
    citations: record.citations,
    failureMessage: record.failureMessage,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function insightConversationList(advisorId: string, clientId: string): Promise<InsightConversationSummary[]> {
  const records = await db.select({
    id: insightConversations.id,
    updatedAt: insightConversations.updatedAt,
    // Drizzle drops table names from columns in a single-table select, so the subquery qualifies its own.
    title: sql<string | null>`(select first_question.text from ${insightMessages} as first_question where first_question.conversation_id = ${insightConversations}.id and first_question.role = 'user' order by first_question.created_at limit 1)`,
  })
    .from(insightConversations)
    .where(and(eq(insightConversations.clientId, clientId), eq(insightConversations.advisorId, advisorId)))
    .orderBy(desc(insightConversations.updatedAt))
    .limit(LIST_LIMIT);

  return records.map((record) => ({
    id: record.id,
    title: insightConversationTitle(record.title ?? ""),
    updatedAt: record.updatedAt.toISOString(),
  }));
}

function insightConversationTitle(question: string): string {
  const flat = question.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX_CHARS ? `${flat.slice(0, TITLE_MAX_CHARS).trimEnd()}…` : flat || "New chat";
}

export async function insightConversationGet(advisorId: string, clientId: string, conversationId: string): Promise<InsightConversation> {
  const records = await db.select({ message: insightMessages })
    .from(insightConversations)
    .leftJoin(insightMessages, eq(insightMessages.conversationId, insightConversations.id))
    .where(and(eq(insightConversations.id, conversationId), eq(insightConversations.clientId, clientId), eq(insightConversations.advisorId, advisorId)))
    .orderBy(asc(insightMessages.createdAt), asc(insightMessages.role));
  if (records.length === 0) throw new AppError(INSIGHT_ERRORS.CONVERSATION_NOT_FOUND);

  return { id: conversationId, clientId, messages: records.flatMap((record) => record.message ? [insightMessageToView(record.message)] : []) };
}

// One question at a time per conversation: the harness session answers turns in order, so a second ask waits for the first.
export async function insightConversationAsk(advisorId: string, clientId: string, conversationId: string | undefined, message: string): Promise<InsightAskResult> {
  const [owner] = await db.select({
    clientId: clients.id,
    conversationId: insightConversations.id,
    busy: sql<boolean>`exists (select 1 from ${insightMessages} where ${insightMessages.conversationId} = ${insightConversations.id} and ${inArray(insightMessages.status, ["pending", "streaming"])})`,
  })
    .from(clients)
    .leftJoin(insightConversations, conversationId
      ? and(eq(insightConversations.id, conversationId), eq(insightConversations.clientId, clients.id), eq(insightConversations.advisorId, advisorId))
      : sql`false`)
    .where(and(eq(clients.id, clientId), eq(clients.advisorId, advisorId)))
    .limit(1);

  if (!owner) throw new AppError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  if (conversationId && !owner.conversationId) throw new AppError(INSIGHT_ERRORS.CONVERSATION_NOT_FOUND);
  if (owner.busy && !(await insightConversationReleaseStale(owner.conversationId!))) throw new AppError(INSIGHT_ERRORS.CONVERSATION_BUSY);

  try {
    return await insightConversationInsertTurn(advisorId, clientId, owner.conversationId, message);
  } catch (err) {
    // The only unique index this insert can hit is the one allowing a single open answer per conversation.
    if (isUniqueViolation(err)) throw new AppError(INSIGHT_ERRORS.CONVERSATION_BUSY);
    throw err;
  }
}

// An answer whose worker died mid-run would otherwise block the conversation for good.
async function insightConversationReleaseStale(conversationId: string): Promise<boolean> {
  const released = await db.update(insightMessages)
    .set({ status: "failed", failureMessage: INSIGHT_ERRORS.ANSWER_FAILED.MESSAGE })
    .where(and(
      eq(insightMessages.conversationId, conversationId),
      inArray(insightMessages.status, ["pending", "streaming"]),
      lt(insightMessages.updatedAt, new Date(Date.now() - STALE_ANSWER_MS)),
    ))
    .returning({ id: insightMessages.id });

  return released.length > 0;
}

function insightConversationInsertTurn(advisorId: string, clientId: string, conversationId: string | null, message: string): Promise<InsightAskResult> {
  return db.transaction(async (tx) => {
    const id = conversationId
      ? (await tx.update(insightConversations).set({ updatedAt: new Date() }).where(eq(insightConversations.id, conversationId)).returning({ id: insightConversations.id }))[0]!.id
      : (await tx.insert(insightConversations).values({ clientId, advisorId }).returning({ id: insightConversations.id }))[0]!.id;

    const askedAt = new Date();
    const records = await tx.insert(insightMessages)
      .values([
        { conversationId: id, role: "user", status: "complete", text: message, createdAt: askedAt },
        { conversationId: id, role: "assistant", status: "pending", text: "", createdAt: new Date(askedAt.getTime() + 1) },
      ])
      .returning();

    return { conversationId: id, messages: records.map(insightMessageToView) };
  });
}
