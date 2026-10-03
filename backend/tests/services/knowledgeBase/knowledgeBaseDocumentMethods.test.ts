import { beforeEach, describe, expect, it, vi } from "vitest";

const { s3Send, bedrockSend } = vi.hoisted(() => ({ s3Send: vi.fn(), bedrockSend: vi.fn() }));

vi.mock("../../../loaders/s3Loader.js", () => ({ s3_client: { send: s3Send } }));
vi.mock("../../../loaders/bedrockAgentLoader.js", () => ({
  bedrock_agent_client: { send: bedrockSend },
  BEDROCK_KNOWLEDGE_BASE_ID: "KB123",
  BEDROCK_DATA_SOURCE_ID: "DS123",
  BEDROCK_KNOWLEDGE_BASE_BUCKET: "kb-bucket",
}));

const { knowledgeBaseDocumentWrite, knowledgeBaseDocumentSyncStart } = await import("../../../services/knowledgeBase/knowledgeBaseDocumentMethods.js");

const DOCUMENT = {
  documentId: "doc-1",
  clientId: "household-1",
  fileName: "w2.pdf",
  formType: "W-2",
  tags: ["Tax", "Earnings"],
  taxYear: 2025,
  pages: [
    { page: 1, text: "page one", fields: [{ fieldId: "f-1", key: "Wages", value: "100", confidence: 97.5 }] },
    { page: 2, text: "page two", fields: [] },
  ],
};

function putInputs() {
  return s3Send.mock.calls.map(([command]) => command.input);
}

beforeEach(() => {
  vi.clearAllMocks();
  s3Send.mockResolvedValue({});
});

describe("knowledgeBaseDocumentWrite", () => {
  it("writes one body and one metadata sidecar per page", async () => {
    await expect(knowledgeBaseDocumentWrite(DOCUMENT)).resolves.toEqual(["documents/doc-1/page-1.json", "documents/doc-1/page-2.json"]);

    expect(putInputs().map((input) => input.Key)).toEqual([
      "documents/doc-1/page-1.json",
      "documents/doc-1/page-1.json.metadata.json",
      "documents/doc-1/page-2.json",
      "documents/doc-1/page-2.json.metadata.json",
    ]);
    expect(putInputs().every((input) => input.Bucket === "kb-bucket")).toBe(true);
  });

  it("keeps confidence, document id and page on every field in the indexed body", async () => {
    await knowledgeBaseDocumentWrite(DOCUMENT);

    const body = JSON.parse(putInputs()[0].Body);
    expect(body.fields).toEqual([{ fieldId: "f-1", key: "Wages", value: "100", confidence: 97.5, documentId: "doc-1", page: 1 }]);
  });

  it("puts the page's filter attributes in its sidecar and leaves out ones the document lacks", async () => {
    await knowledgeBaseDocumentWrite(DOCUMENT);

    expect(JSON.parse(putInputs()[3].Body)).toEqual({
      metadataAttributes: { documentId: "doc-1", page: 2, clientId: "household-1", tags: ["Tax", "Earnings"], taxYear: 2025 },
    });
  });
});

describe("knowledgeBaseDocumentSyncStart", () => {
  it("starts ingestion with a client token unique to the window", async () => {
    bedrockSend.mockResolvedValue({ ingestionJob: { ingestionJobId: "job-1" } });

    await expect(knowledgeBaseDocumentSyncStart(42)).resolves.toBe("job-1");

    const input = bedrockSend.mock.calls[0]![0].input;
    expect(input).toEqual({ knowledgeBaseId: "KB123", dataSourceId: "DS123", clientToken: "knowledge-base-sync-window-0000000042" });
    expect(input.clientToken.length).toBeGreaterThanOrEqual(33);
  });
});
