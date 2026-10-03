import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { InsightConversation, InsightMessage } from "@lpl-hacks/shared/src/types/native/insight/insightMessage.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import requireSettings from "../../modules/requireSettings.js";
import { clients } from "../../schemas/clients.js";
import { insightConversations, insightMessages } from "../../schemas/insight.js";
import { CLIENT_ERRORS } from "../../types/native/clients/errors.js";
import { INSIGHT_ERRORS } from "../../types/native/insight/errors.js";

const { STALE_ANSWER_MS } = requireSettings("INSIGHT");

type InsightMessageRecord = typeof insightMessages.$inferSelect;

export type InsightAskResult = {
  conversationId: string;
  messages: InsightMessage[];
};

const INSIGHT_OPEN_ANSWER_INDEX = "insight_messages_one_open_answer_idx";

function insightCheckOpenAnswerConflict(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string; constraint?: string } })?.cause ?? (err as { code?: string; constraint?: string });
  return cause?.code === "23505" && cause.constraint === INSIGHT_OPEN_ANSWER_INDEX;
}

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

export async function insightConversationGet(advisorId: string, clientId: string): Promise<InsightConversation | null> {
  const [conversation] = await db.select({ id: insightConversations.id })
    .from(insightConversations)
    .where(and(eq(insightConversations.clientId, clientId), eq(insightConversations.advisorId, advisorId)))
    .orderBy(desc(insightConversations.createdAt))
    .limit(1);
  if (!conversation) return null;

  const messages = await db.select()
    .from(insightMessages)
    .where(eq(insightMessages.conversationId, conversation.id))
    .orderBy(asc(insightMessages.createdAt), asc(insightMessages.role));

  return { id: conversation.id, clientId, messages: messages.map(insightMessageToView) };
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
    if (insightCheckOpenAnswerConflict(err)) throw new AppError(INSIGHT_ERRORS.CONVERSATION_BUSY);
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
    const id = conversationId ?? (await tx.insert(insightConversations)
      .values({ clientId, advisorId })
      .returning({ id: insightConversations.id }))[0]!.id;

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
