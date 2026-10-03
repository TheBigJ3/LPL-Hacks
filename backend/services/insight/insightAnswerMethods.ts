import {
  InvokeHarnessCommand,
  ServiceQuotaExceededException,
  ThrottlingException,
  type HarnessContentBlock,
  type HarnessMessage,
} from "@aws-sdk/client-bedrock-agentcore";
import { and, asc, eq } from "drizzle-orm";
import type { InsightSource } from "@lpl-hacks/shared/src/types/native/insight/insightMessage.js";
import insightProgress from "@lpl-hacks/shared/src/types/native/sockets/insight/progress.js";
import insightSettled from "@lpl-hacks/shared/src/types/native/sockets/insight/settled.js";
import { agentcore_client, INSIGHT_HARNESS_ARN } from "../../loaders/agentCoreLoader.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import requireSettings from "../../modules/requireSettings.js";
import { ServerError } from "../../modules/ServerError.js";
import { socketRoom } from "../../modules/socketRoom.js";
import { clientMembers, clients } from "../../schemas/clients.js";
import { insightConversations, insightMessages } from "../../schemas/insight.js";
import { INSIGHT_ERRORS } from "../../types/native/insight/errors.js";
import { answerCheckFiltersNarrowed } from "../answer/answerChecks.js";
import { realtimeNotifyRooms } from "../realtime/realtimeMethods.js";
import { retrievalChunkSearch } from "../retrieval/retrievalChunkMethods.js";
import {
  INSIGHT_ALLOWED_TOOLS,
  INSIGHT_SEARCH_TOOL_NAME,
  INSIGHT_SYSTEM_PROMPT,
  insightBuildHouseholdPrompt,
  insightBuildSources,
  insightBuildToolResult,
  insightCheckFabricatedToolUse,
  insightCheckNextSourceNumber,
  insightCheckSearchInput,
  insightResolveCitations,
  type InsightHousehold,
} from "./insightAnswerChecks.js";

const { MAX_SOURCES, MAX_TOOL_ROUNDS, PROGRESS_INTERVAL_MS, QUOTE_MAX_CHARS } = requireSettings("INSIGHT");

export type InsightAnswerOutcome = "skipped" | "complete" | "failed";

type InsightToolUse = {
  toolUseId: string;
  name: string;
  input: string;
};

type InsightHarnessTurn = {
  text: string;
  toolUses: InsightToolUse[];
  stopReason: string | null;
};

type InsightAnswerContext = {
  conversationId: string;
  messageId: string;
  household: InsightHousehold;
  systemPrompt: string;
  onText: (text: string) => void;
};

async function insightAnswerInvoke(context: InsightAnswerContext, messages: HarnessMessage[], answerSoFar: string): Promise<InsightHarnessTurn> {
  let response;
  try {
    response = await agentcore_client.send(new InvokeHarnessCommand({
      harnessArn: INSIGHT_HARNESS_ARN,
      runtimeSessionId: context.conversationId,
      actorId: context.household.clientId,
      allowedTools: INSIGHT_ALLOWED_TOOLS,
      systemPrompt: [{ text: context.systemPrompt }],
      messages,
    }));
  } catch (err) {
    if (err instanceof ThrottlingException || err instanceof ServiceQuotaExceededException) throw new AppError(INSIGHT_ERRORS.ANSWER_UNAVAILABLE);
    throw err;
  }

  const toolUses = new Map<number, InsightToolUse>();
  let text = "";
  let stopReason: string | null = null;

  for await (const event of response.stream ?? []) {
    if (event.contentBlockStart?.start?.toolUse) {
      const { toolUseId, name } = event.contentBlockStart.start.toolUse;
      toolUses.set(event.contentBlockStart.contentBlockIndex ?? toolUses.size, { toolUseId: toolUseId ?? "", name: name ?? "", input: "" });
    } else if (event.contentBlockDelta?.delta?.text !== undefined) {
      text += event.contentBlockDelta.delta.text;
      context.onText(answerSoFar + text);
    } else if (event.contentBlockDelta?.delta?.toolUse) {
      const toolUse = toolUses.get(event.contentBlockDelta.contentBlockIndex ?? -1);
      if (toolUse) toolUse.input += event.contentBlockDelta.delta.toolUse.input ?? "";
    } else if (event.messageStop) {
      stopReason = event.messageStop.stopReason ?? null;
    } else if (event.validationException || event.internalServerException || event.runtimeClientError) {
      const failure = event.validationException ?? event.internalServerException ?? event.runtimeClientError;
      throw new ServerError(undefined, `[insight] harness stream failed for ${context.messageId}: ${failure?.message ?? "unknown error"}`);
    }
  }

  return { text, toolUses: [...toolUses.values()], stopReason };
}

function insightAnswerParseInput(input: string): unknown {
  try {
    return input ? JSON.parse(input) : {};
  } catch {
    return null;
  }
}

async function insightAnswerSearch(household: InsightHousehold, toolUse: InsightToolUse, firstNumber: number): Promise<{ block: HarnessContentBlock; sources: InsightSource[] }> {
  const search = toolUse.name === INSIGHT_SEARCH_TOOL_NAME ? insightCheckSearchInput(household, insightAnswerParseInput(toolUse.input)) : null;

  if (!search) {
    return {
      block: { toolResult: { toolUseId: toolUse.toolUseId, status: "error", content: [{ text: `Unknown tool or invalid input. Call ${INSIGHT_SEARCH_TOOL_NAME} with a non-empty query.` }] } },
      sources: [],
    };
  }

  let chunks = await retrievalChunkSearch(search.query, search.filters, MAX_SOURCES);
  // The model's filters can over-narrow, so an empty result falls back to the whole household before reporting nothing.
  if (chunks.length === 0 && answerCheckFiltersNarrowed(search.filters)) {
    chunks = await retrievalChunkSearch(search.query, { clientId: household.clientId }, MAX_SOURCES);
  }

  const sources = insightBuildSources(chunks, firstNumber, QUOTE_MAX_CHARS);
  return {
    block: { toolResult: { toolUseId: toolUse.toolUseId, status: "success", content: [{ text: insightBuildToolResult(household, chunks, sources) }] } },
    sources,
  };
}

async function insightAnswerConverse(context: InsightAnswerContext, question: string, priorSources: InsightSource[]): Promise<{ text: string; sources: InsightSource[] }> {
  const sources: InsightSource[] = [];
  let nextNumber = insightCheckNextSourceNumber(priorSources);
  let messages: HarnessMessage[] = [{ role: "user", content: [{ text: question }] }];
  let answer = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const prefix = answer && !answer.endsWith("\n") ? `${answer}\n\n` : answer;
    const turn = await insightAnswerInvoke(context, messages, prefix);
    answer = turn.text ? prefix + turn.text : answer;

    if (turn.stopReason !== "tool_use" || turn.toolUses.length === 0) break;
    if (round === MAX_TOOL_ROUNDS) throw new ServerError(undefined, `[insight] ${context.messageId} still searching after ${MAX_TOOL_ROUNDS} rounds`);

    const results: HarnessContentBlock[] = [];
    for (const toolUse of turn.toolUses) {
      const result = await insightAnswerSearch(context.household, toolUse, nextNumber);
      nextNumber += result.sources.length;
      sources.push(...result.sources);
      results.push(result.block);
    }
    messages = [{ role: "user", content: results }];
  }

  if (!answer.trim()) throw new ServerError(undefined, `[insight] ${context.messageId} finished without any answer text`);
  if (insightCheckFabricatedToolUse(answer)) throw new ServerError(undefined, `[insight] ${context.messageId} wrote tool calls as text instead of calling the tool`);
  return { text: answer, sources };
}

function insightAnswerThrottle(conversationId: string, messageId: string): { push: (text: string) => void; flush: () => void } {
  const rooms = [socketRoom("insight", conversationId)];
  let latest = "";
  let sentAt = 0;
  let sent = "";

  const flush = () => {
    if (latest === sent) return;
    sent = latest;
    sentAt = Date.now();
    realtimeNotifyRooms(rooms, insightProgress, { conversationId, messageId, text: latest });
  };

  return {
    push: (text) => {
      latest = text;
      if (Date.now() - sentAt >= PROGRESS_INTERVAL_MS) flush();
    },
    flush,
  };
}

export async function insightAnswerRun(messageId: string): Promise<InsightAnswerOutcome> {
  const [claimed] = await db.update(insightMessages)
    .set({ status: "streaming" })
    .where(and(eq(insightMessages.id, messageId), eq(insightMessages.status, "pending")))
    .returning({ conversationId: insightMessages.conversationId, createdAt: insightMessages.createdAt });
  if (!claimed) return "skipped";

  const { conversationId } = claimed;
  try {
    return await insightAnswerComplete(conversationId, messageId, claimed.createdAt);
  } catch (err) {
    await insightAnswerMarkFailed(conversationId, messageId, err instanceof AppError ? err.message : INSIGHT_ERRORS.ANSWER_FAILED.MESSAGE);
    if (err instanceof AppError) return "failed";
    throw err;
  }
}

async function insightAnswerComplete(conversationId: string, messageId: string, askedBefore: Date): Promise<InsightAnswerOutcome> {
  const [householdRows, history] = await Promise.all([
    db.select({
      client: { id: clients.id, name: clients.name, kind: clients.kind },
      member: { id: clientMembers.id, name: clientMembers.name },
    })
      .from(insightConversations)
      .innerJoin(clients, eq(clients.id, insightConversations.clientId))
      .leftJoin(clientMembers, eq(clientMembers.clientId, clients.id))
      .where(eq(insightConversations.id, conversationId))
      .orderBy(asc(clientMembers.name)),
    db.select({ role: insightMessages.role, text: insightMessages.text, sources: insightMessages.sources, createdAt: insightMessages.createdAt })
      .from(insightMessages)
      .where(eq(insightMessages.conversationId, conversationId))
      .orderBy(asc(insightMessages.createdAt)),
  ]);

  const client = householdRows[0]?.client;
  const question = history.filter((message) => message.role === "user" && message.createdAt <= askedBefore).at(-1)?.text;
  if (!client || !question) throw new ServerError(undefined, `[insight] ${messageId} has no client or question to answer`);

  const household: InsightHousehold = {
    clientId: client.id,
    name: client.name,
    kind: client.kind,
    members: householdRows.flatMap((row) => row.member ? [row.member] : []),
  };
  const priorSources = history.flatMap((message) => message.sources);
  const progress = insightAnswerThrottle(conversationId, messageId);
  const context: InsightAnswerContext = {
    conversationId,
    messageId,
    household,
    systemPrompt: `${INSIGHT_SYSTEM_PROMPT}\n\n${insightBuildHouseholdPrompt(household, new Date().toISOString().slice(0, 10))}`,
    onText: progress.push,
  };

  let result;
  try {
    result = await insightAnswerConverse(context, question, priorSources);
  } finally {
    progress.flush();
  }

  const { text, citations } = insightResolveCitations(result.text, [...priorSources, ...result.sources]);
  const updated = await db.update(insightMessages)
    .set({ status: "complete", text, citations, sources: result.sources })
    .where(and(eq(insightMessages.id, messageId), eq(insightMessages.status, "streaming")))
    .returning({ id: insightMessages.id });

  if (updated.length === 0) return "skipped";
  realtimeNotifyRooms([socketRoom("insight", conversationId)], insightSettled, { conversationId, messageId });
  return "complete";
}

export async function insightAnswerMarkFailed(conversationId: string, messageId: string, failureMessage: string): Promise<boolean> {
  const updated = await db.update(insightMessages)
    .set({ status: "failed", failureMessage })
    .where(and(eq(insightMessages.id, messageId), eq(insightMessages.status, "streaming")))
    .returning({ id: insightMessages.id });

  if (updated.length === 0) return false;
  realtimeNotifyRooms([socketRoom("insight", conversationId)], insightSettled, { conversationId, messageId });
  return true;
}
