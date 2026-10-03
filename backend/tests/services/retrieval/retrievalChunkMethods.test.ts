import { ThrottlingException, ValidationException } from "@aws-sdk/client-bedrock-agent-runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("../../../loaders/bedrockAgentRuntimeLoader.js", () => ({ bedrock_agent_runtime_client: { send } }));
vi.mock("../../../loaders/bedrockAgentLoader.js", () => ({ BEDROCK_KNOWLEDGE_BASE_ID: "KB123" }));

const { retrievalChunkSearch } = await import("../../../services/retrieval/retrievalChunkMethods.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retrievalChunkSearch", () => {
  it("sends the filter inside the managed search call and drops uncitable chunks", async () => {
    send.mockResolvedValue({
      retrievalResults: [
        { content: { text: "cited" }, score: 0.5, metadata: { documentId: "doc-1", sectionId: "document", clientId: "h-1" } },
        { content: { text: "uncited" }, score: 0.9, metadata: { clientId: "h-1" } },
      ],
    });

    const chunks = await retrievalChunkSearch("wages", { clientId: "h-1" }, 4);

    expect(send.mock.calls[0]![0].input).toEqual({
      knowledgeBaseId: "KB123",
      retrievalQuery: { text: "wages" },
      retrievalConfiguration: { managedSearchConfiguration: { numberOfResults: 4, filter: { equals: { key: "clientId", value: "h-1" } } } },
    });
    expect(chunks.map((chunk) => chunk.text)).toEqual(["cited"]);
  });

  it("throws SEARCH_UNAVAILABLE when Bedrock throttles", async () => {
    send.mockRejectedValue(new ThrottlingException({ message: "slow down", $metadata: {} }));

    await expect(retrievalChunkSearch("wages", { clientId: "h-1" }, 4)).rejects.toMatchObject({ _statusCode: 503, _status: "SERVICE_UNAVAILABLE" });
  });

  it("rethrows any other Bedrock failure untouched", async () => {
    const error = new ValidationException({ message: "bad filter", $metadata: {} });
    send.mockRejectedValue(error);

    await expect(retrievalChunkSearch("wages", { clientId: "h-1" }, 4)).rejects.toBe(error);
  });
});
