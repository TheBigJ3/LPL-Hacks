import { beforeEach, describe, expect, it, vi } from "vitest";

const { s3Send, bedrockSend } = vi.hoisted(() => ({ s3Send: vi.fn(), bedrockSend: vi.fn() }));

vi.mock("../../../loaders/s3Loader.js", () => ({ s3_client: { send: s3Send }, S3_DOCUMENTS_BUCKET: "documents-bucket" }));
vi.mock("../../../loaders/bedrockAgentLoader.js", () => ({
  bedrock_agent_client: { send: bedrockSend },
  BEDROCK_KNOWLEDGE_BASE_ID: "KB123",
  BEDROCK_DATA_SOURCE_ID: "DS123",
  BEDROCK_KNOWLEDGE_BASE_BUCKET: "kb-bucket",
}));

const { knowledgeBaseDocumentIngestDecision, knowledgeBaseDocumentIndexPages, knowledgeBaseDocumentRemove, knowledgeBaseDocumentSyncStart } = await import("../../../services/knowledgeBase/knowledgeBaseDocumentMethods.js");
const { knowledgeBaseDocumentCheckId } = await import("../../../services/knowledgeBase/knowledgeBaseDocumentChecks.js");

const RAW = `{"answers":{"docType":{"type":"choice","choice":"w2","probabilities":{"w2":0.89},"confidence":0.73,"evidence":[{"id":"document","text":"W-2 2025. Wages: 110,000.00."}]},"tag_earnings":{"answer":true,"status":"confirmed","binary":{"confidence":0.98},"evidence":[{"id":"document","text":"W-2 2025. Wages: 110,000.00."}]}}}`;
const DOCUMENT_ID = knowledgeBaseDocumentCheckId("HH006", "taylor_w2_2025.pdf");

function sent(name: string) {
  return s3Send.mock.calls.map(([command]) => command).filter((command) => command.constructor.name === name).map((command) => command.input);
}

beforeEach(() => {
  vi.clearAllMocks();
  s3Send.mockImplementation(async (command) => (command.constructor.name === "ListObjectsV2Command" ? { Contents: [] } : {}));
});

describe("knowledgeBaseDocumentIngestDecision", () => {
  it("stores the original bytes untouched outside the knowledge base bucket", async () => {
    const raw = Buffer.from(RAW);

    await knowledgeBaseDocumentIngestDecision("HH006", "taylor_w2_2025.pdf", raw);

    const original = sent("PutObjectCommand").find((input) => input.Bucket === "documents-bucket");
    expect(original).toMatchObject({ Key: "decisions/HH006/taylor_w2_2025.pdf.json" });
    expect(original!.Body).toBe(raw);
  });

  it("indexes each section with filter metadata and none of the raw scores", async () => {
    await knowledgeBaseDocumentIngestDecision("HH006", "taylor_w2_2025.pdf", Buffer.from(RAW));

    const indexed = sent("PutObjectCommand").filter((input) => input.Bucket === "kb-bucket");
    expect(indexed.map((input) => input.Key)).toEqual([`documents/${DOCUMENT_ID}/document.json`, `documents/${DOCUMENT_ID}/document.json.metadata.json`]);
    expect(JSON.parse(indexed[1]!.Body)).toEqual({
      metadataAttributes: {
        documentId: DOCUMENT_ID,
        clientId: "HH006",
        fileName: "taylor_w2_2025.pdf",
        sectionId: "document",
        tags: ["tag_earnings"],
        docType: "w2",
        taxYear: 2025,
      },
    });
    expect(indexed.map((input) => input.Body).join("")).not.toMatch(/probabilities|confidence|0\.89|0\.73|0\.98/);
  });

  it("leaves empty tag and member lists out of the metadata", async () => {
    const untagged = JSON.stringify({ answers: { docType: { type: "other", evidence: [{ id: "document", text: "Letter" }] } } });

    await knowledgeBaseDocumentIngestDecision("HH006", "letter.pdf", Buffer.from(untagged));

    const metadata = sent("PutObjectCommand").find((input) => input.Key.endsWith(".metadata.json"))!;
    expect(Object.keys(JSON.parse(metadata.Body).metadataAttributes)).toEqual(["documentId", "clientId", "fileName", "sectionId"]);
  });

  it("deletes indexed objects the new decision no longer has", async () => {
    s3Send.mockImplementation(async (command) => (command.constructor.name === "ListObjectsV2Command"
      ? { Contents: [{ Key: `documents/${DOCUMENT_ID}/document.json` }, { Key: `documents/${DOCUMENT_ID}/section-009.json` }, { Key: `documents/${DOCUMENT_ID}/section-009.json.metadata.json` }] }
      : {}));

    const result = await knowledgeBaseDocumentIngestDecision("HH006", "taylor_w2_2025.pdf", Buffer.from(RAW));

    expect(result.removedKeys).toEqual([`documents/${DOCUMENT_ID}/section-009.json`, `documents/${DOCUMENT_ID}/section-009.json.metadata.json`]);
    expect(sent("DeleteObjectsCommand")).toEqual([{ Bucket: "kb-bucket", Delete: { Objects: result.removedKeys.map((Key) => ({ Key })), Quiet: true } }]);
  });

  it("writes nothing when the decision is invalid", async () => {
    await expect(knowledgeBaseDocumentIngestDecision("HH006", "x.pdf", Buffer.from("{}"))).rejects.toMatchObject({ _statusCode: 422 });
    expect(s3Send).not.toHaveBeenCalled();
  });
});

describe("knowledgeBaseDocumentIndexPages", () => {
  const UUID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
  const LEGACY_ID = knowledgeBaseDocumentCheckId("HH006", "taylor_w2_2025.pdf");
  const indexed = {
    documentId: UUID,
    clientId: "HH006",
    fileName: "taylor_w2_2025.pdf",
    docType: "w2",
    taxYear: 2025,
    tags: ["income"],
    familyMembers: ["member-1"],
    memberNames: ["Taylor Reed"],
    pageCount: 2,
    pages: [
      { page: 1, fields: [{ fieldId: "f1", label: "Wages", value: "110,000.00", confidence: 99, verified: true, corrected: false }], lines: ["W-2 Wage and Tax Statement"] },
      { page: 2, fields: [], lines: [] },
    ],
  };

  it("writes one page file per page with text under the document's own id, skipping empty pages", async () => {
    const result = await knowledgeBaseDocumentIndexPages(indexed);

    const puts = sent("PutObjectCommand").filter((input) => input.Bucket === "kb-bucket");
    expect(puts.map((input) => input.Key)).toEqual([`documents/${UUID}/page-1.json`, `documents/${UUID}/page-1.json.metadata.json`]);
    expect(puts[0]!.Body).toContain("- Wages: 110,000.00 [verified]");
    expect(JSON.parse(puts[1]!.Body).metadataAttributes).toMatchObject({ sourceType: "document", documentId: UUID, sectionId: "page-1", page: 1 });
    expect(result.pageKeys).toEqual([`documents/${UUID}/page-1.json`]);
  });

  it("removes stale pages and the entries indexed under the old client and file name id", async () => {
    s3Send.mockImplementation(async (command) => {
      if (command.constructor.name !== "ListObjectsV2Command") return {};
      const prefix = command.input.Prefix as string;
      if (prefix === `documents/${UUID}/`) return { Contents: [{ Key: `documents/${UUID}/page-1.json` }, { Key: `documents/${UUID}/page-3.json` }] };
      if (prefix === `documents/${LEGACY_ID}/`) return { Contents: [{ Key: `documents/${LEGACY_ID}/document.json` }] };
      return { Contents: [] };
    });

    const result = await knowledgeBaseDocumentIndexPages(indexed);

    expect(result.removedKeys).toEqual([`documents/${UUID}/page-3.json`, `documents/${LEGACY_ID}/document.json`]);
    expect(sent("DeleteObjectsCommand")[0]).toMatchObject({ Bucket: "kb-bucket" });
  });

  it("refuses a document with no text on any page", async () => {
    await expect(knowledgeBaseDocumentIndexPages({ ...indexed, pages: [{ page: 1, fields: [], lines: [] }] })).rejects.toMatchObject({ message: "The document has no extracted text to index" });
    expect(sent("PutObjectCommand")).toEqual([]);
  });
});

describe("knowledgeBaseDocumentRemove", () => {
  it("removes the document's indexed objects and its stored original", async () => {
    s3Send.mockImplementation(async (command) => (command.constructor.name === "ListObjectsV2Command" ? { Contents: [{ Key: `documents/${DOCUMENT_ID}/document.json` }] } : {}));

    await knowledgeBaseDocumentRemove("HH006", "taylor_w2_2025.pdf");

    expect(sent("DeleteObjectsCommand")).toEqual(expect.arrayContaining([
      { Bucket: "kb-bucket", Delete: { Objects: [{ Key: `documents/${DOCUMENT_ID}/document.json` }], Quiet: true } },
      { Bucket: "documents-bucket", Delete: { Objects: [{ Key: "decisions/HH006/taylor_w2_2025.pdf.json" }], Quiet: true } },
    ]));
  });
});

describe("knowledgeBaseDocumentSyncStart", () => {
  it("starts ingestion with a client token unique to the window", async () => {
    bedrockSend.mockResolvedValue({ ingestionJob: { ingestionJobId: "job-1" } });

    await expect(knowledgeBaseDocumentSyncStart(42)).resolves.toBe("job-1");
    expect(bedrockSend.mock.calls[0]![0].input).toEqual({ knowledgeBaseId: "KB123", dataSourceId: "DS123", clientToken: "knowledge-base-sync-window-0000000042" });
  });
});
