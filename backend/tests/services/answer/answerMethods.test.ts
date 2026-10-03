import { ThrottlingException } from "@aws-sdk/client-bedrock-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerError } from "../../../modules/ServerError.js";

const { send, retrievalChunkSearch } = vi.hoisted(() => ({
  send: vi.fn(),
  retrievalChunkSearch: vi.fn(),
}));

vi.mock("../../../loaders/bedrockRuntimeLoader.js", () => ({
  bedrock_runtime_client: { send },
  BEDROCK_FILTER_MODEL_ID: "filter-model",
  BEDROCK_ANSWER_MODEL_ID: "answer-model",
}));
vi.mock("../../../services/retrieval/retrievalChunkMethods.js", () => ({ retrievalChunkSearch }));

const { answerAsk } = await import("../../../services/answer/answerMethods.js");

const CHUNK = {
  text: JSON.stringify({ documentId: "doc-1", page: 1, fileName: "w2.pdf", fields: [{ fieldId: "f-1", value: "100" }] }),
  score: 0.5,
  citation: { documentId: "doc-1", page: 1 },
  clientId: "h-1",
  tags: ["Tax"],
  taxYear: 2025,
  familyMember: null,
};

function toolReply(input: unknown) {
  return { output: { message: { content: [{ toolUse: { name: "tool", toolUseId: "t", input } }] } } };
}

function modelOf(callIndex: number) {
  return send.mock.calls[callIndex]![0].input.modelId;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("answerAsk", () => {
  it("searches with the parsed filters and returns cited statements", async () => {
    send
      .mockResolvedValueOnce(toolReply({ taxYear: 2025, tags: ["Tax"] }))
      .mockResolvedValueOnce(toolReply({ answerable: true, statements: [{ text: "Wages were 100.", sourceIds: ["S1"], fieldIds: ["f-1"] }] }));
    retrievalChunkSearch.mockResolvedValue([CHUNK]);

    const result = await answerAsk("2025 wages?", "h-1");

    expect(retrievalChunkSearch).toHaveBeenCalledWith("2025 wages?", { clientId: "h-1", taxYear: 2025, tags: ["Tax"] }, 8);
    expect([modelOf(0), modelOf(1)]).toEqual(["filter-model", "answer-model"]);
    expect(result).toEqual({
      answerable: true,
      statements: [{ text: "Wages were 100.", citations: [{ documentId: "doc-1", page: 1, fileName: "w2.pdf", fieldId: "f-1", verified: false }] }],
      filters: { clientId: "h-1", taxYear: 2025, tags: ["Tax"] },
    });
  });

  it("retries with only the client when the narrowed search finds nothing", async () => {
    send
      .mockResolvedValueOnce(toolReply({ taxYear: 2024, tags: [] }))
      .mockResolvedValueOnce(toolReply({ answerable: true, statements: [{ text: "Wages were 100.", sourceIds: ["S1"], fieldIds: ["f-1"] }] }));
    retrievalChunkSearch.mockResolvedValueOnce([]).mockResolvedValueOnce([CHUNK]);

    await answerAsk("2024 wages?", "h-1");

    expect(retrievalChunkSearch).toHaveBeenNthCalledWith(2, "2024 wages?", { clientId: "h-1" }, 8);
  });

  it("answers not-found without calling the answer model when the household has nothing", async () => {
    send.mockResolvedValueOnce(toolReply({ taxYear: null, tags: [] }));
    retrievalChunkSearch.mockResolvedValue([]);

    const result = await answerAsk("anything?", "h-1");

    expect(retrievalChunkSearch).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.answerable).toBe(false);
  });

  it("throws ANSWER_UNAVAILABLE when Bedrock throttles", async () => {
    send.mockRejectedValue(new ThrottlingException({ message: "slow down", $metadata: {} }));

    await expect(answerAsk("q", "h-1")).rejects.toMatchObject({ _statusCode: 503, _status: "SERVICE_UNAVAILABLE" });
  });

  it("throws a ServerError when the model skips the tool call", async () => {
    send.mockResolvedValue({ output: { message: { content: [{ text: "hello" }] } }, stopReason: "end_turn" });

    await expect(answerAsk("q", "h-1")).rejects.toBeInstanceOf(ServerError);
  });

  it("throws a ServerError when the answer does not match its schema", async () => {
    send.mockResolvedValueOnce(toolReply({ taxYear: null, tags: [] })).mockResolvedValueOnce(toolReply({ statements: "nope" }));
    retrievalChunkSearch.mockResolvedValue([CHUNK]);

    await expect(answerAsk("q", "h-1")).rejects.toBeInstanceOf(ServerError);
  });
});
