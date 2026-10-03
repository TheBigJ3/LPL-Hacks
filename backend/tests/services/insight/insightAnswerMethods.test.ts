import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../modules/AppError.js";
import { RETRIEVAL_ERRORS } from "../../../types/native/retrieval/errors.js";

const { db, results, calls, harnessSend, search, notify } = vi.hoisted(() => {
  const results: unknown[][] = [];
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = (): any => new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve(results.shift() ?? []);
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return chain();
      };
    },
  });
  return { db: chain(), results, calls, harnessSend: vi.fn(), search: vi.fn(), notify: vi.fn() };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));
vi.mock("../../../loaders/agentCoreLoader.js", () => ({ agentcore_client: { send: harnessSend }, INSIGHT_HARNESS_ARN: "arn:harness" }));
vi.mock("../../../services/retrieval/retrievalChunkMethods.js", () => ({ retrievalChunkSearch: search }));
vi.mock("../../../services/realtime/realtimeMethods.js", () => ({ realtimeNotifyRooms: notify }));

const { insightAnswerRun } = await import("../../../services/insight/insightAnswerMethods.js");

const CONVERSATION_ID = "3272d61b-49fa-43f8-bdd7-afda36388bb3";
const MESSAGE_ID = "668b7c03-c0a4-48c6-ae65-25d0e0b9b1aa";
const ASKED_AT = new Date("2026-10-03T12:00:00Z");

const CHUNK = {
  text: "Document: adam_w2.pdf\nFields:\n- Wages: $ 148,250.00 [verified]",
  score: 0.8,
  citation: { documentId: "doc-1", sectionId: "page-1", page: 1 },
  sourceType: "document",
  clientId: "client-1",
  fileName: "adam_w2.pdf",
  docType: "w2",
  tags: [],
  familyMembers: ["member-adam"],
  taxYear: 2025,
  date: null,
};

function stream(events: unknown[]) {
  return { stream: (async function* () { yield* events; })() };
}

const toolCall = (input: unknown) => stream([
  { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: "tool-1", name: "search_client_records" } } } },
  { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: JSON.stringify(input) } } } },
  { messageStop: { stopReason: "tool_use" } },
]);

const answer = (text: string) => stream([
  { contentBlockDelta: { contentBlockIndex: 0, delta: { text } } },
  { messageStop: { stopReason: "end_turn" } },
]);

function queueConversation() {
  results.push(
    [{ conversationId: CONVERSATION_ID, createdAt: ASKED_AT }],
    [
      { client: { id: "client-1", name: "Johnson Family", kind: "household" }, member: { id: "member-adam", name: "Adam Johnson" } },
    ],
    [{ role: "user", text: "What were Adam's wages?", sources: [], createdAt: new Date(ASKED_AT.getTime() - 1) }],
  );
}

const setArgs = () => calls.filter((call) => call.method === "set").map((call) => call.args[0] as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  results.length = 0;
  calls.length = 0;
  search.mockResolvedValue([CHUNK]);
});

describe("insightAnswerRun", () => {
  it("skips an answer another run already claimed", async () => {
    results.push([]);

    expect(await insightAnswerRun(MESSAGE_ID)).toBe("skipped");
    expect(harnessSend).not.toHaveBeenCalled();
  });

  it("runs the search for the conversation's client, returns the result on the same session, and saves the cited answer", async () => {
    queueConversation();
    results.push([{ id: MESSAGE_ID }]);
    harnessSend
      .mockResolvedValueOnce(toolCall({ query: "wages", clientId: "another-client", memberIds: ["member-adam"] }))
      .mockResolvedValueOnce(answer("Adam's wages were $148,250.00 [S1]."));

    expect(await insightAnswerRun(MESSAGE_ID)).toBe("complete");

    expect(search).toHaveBeenCalledWith("wages", { clientId: "client-1", familyMembers: ["member-adam"] }, 8);

    const [first, second] = harnessSend.mock.calls.map(([command]) => command.input);
    expect(first).toMatchObject({ runtimeSessionId: CONVERSATION_ID, actorId: "client-1", allowedTools: ["@*/search_client_records"] });
    expect(first.systemPrompt[0].text).toContain("- Adam Johnson: member id member-adam");
    expect(first.messages).toEqual([{ role: "user", content: [{ text: "What were Adam's wages?" }] }]);
    expect(second.runtimeSessionId).toBe(CONVERSATION_ID);
    expect(second.messages[0].content[0].toolResult).toMatchObject({ toolUseId: "tool-1", status: "success" });
    expect(second.messages[0].content[0].toolResult.content[0].text).toContain('<source id="S1"');

    const saved = setArgs().at(-1)!;
    expect(saved).toMatchObject({ status: "complete", text: "Adam's wages were $148,250.00 [S1]." });
    expect(saved.citations).toEqual([expect.objectContaining({ sourceId: "S1", documentId: "doc-1", page: 1, verified: true })]);
    expect(notify).toHaveBeenCalledWith(["insight:" + CONVERSATION_ID], expect.objectContaining({ name: "insight:settled" }), { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID });
  });

  it("marks the answer failed with the search's message when retrieval is throttled", async () => {
    queueConversation();
    results.push([{ id: MESSAGE_ID }]);
    harnessSend.mockResolvedValueOnce(toolCall({ query: "wages" }));
    search.mockRejectedValue(new AppError(RETRIEVAL_ERRORS.SEARCH_UNAVAILABLE));

    expect(await insightAnswerRun(MESSAGE_ID)).toBe("failed");
    expect(setArgs().at(-1)).toEqual({ status: "failed", failureMessage: RETRIEVAL_ERRORS.SEARCH_UNAVAILABLE.MESSAGE });
  });

  it("refuses an answer that writes tool calls as text, and marks it failed", async () => {
    queueConversation();
    results.push([{ id: MESSAGE_ID }]);
    harnessSend.mockResolvedValueOnce(answer("<tool_call>{\"name\":\"search_client_records\"}</tool_call> Adam earned $1 [S1]."));

    await expect(insightAnswerRun(MESSAGE_ID)).rejects.toThrow();
    expect(setArgs().at(-1)).toMatchObject({ status: "failed" });
    expect(setArgs().some((args) => args.status === "complete")).toBe(false);
  });
});
