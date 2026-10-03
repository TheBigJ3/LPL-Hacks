import { GetObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../modules/AppError.js";
import { KNOWLEDGE_BASE_ERRORS } from "../../../types/native/knowledgeBase/errors.js";

const { db, results, calls, s3Send, indexDecision } = vi.hoisted(() => {
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
  return { db: chain(), results, calls, s3Send: vi.fn(), indexDecision: vi.fn() };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));
vi.mock("../../../loaders/s3Loader.js", () => ({ S3_DOCUMENTS_BUCKET: "documents-bucket", s3_client: { send: s3Send } }));
vi.mock("../../../services/knowledgeBase/knowledgeBaseDocumentMethods.js", () => ({ knowledgeBaseDocumentIndexDecision: indexDecision }));

const { documentIndexRun, documentIndexMarkFailed } = await import("../../../services/documents/documentIndexMethods.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const CLIENT_ID = "6b0f1d3c-1f2a-4c5e-9d8b-7a6c5b4e3d21";
const REVIEWED_AT = "2026-10-03T12:00:00.000Z";
const DECISION_KEY = `decisions/${CLIENT_ID}/W-2%202024.pdf.json`;
const DECISION_BYTES = new Uint8Array([123, 125]);

const record = (overrides: Record<string, unknown> = {}) => ({
  fileName: "W-2 2024.pdf",
  clientId: CLIENT_ID,
  decisionS3Key: DECISION_KEY,
  indexStatus: "pending",
  reviewedAt: new Date(REVIEWED_AT),
  ...overrides,
});

const setArgs = () => calls.filter((call) => call.method === "set").map((call) => call.args[0]);

beforeEach(() => {
  vi.clearAllMocks();
  results.length = 0;
  calls.length = 0;
  s3Send.mockResolvedValue({ Body: { transformToByteArray: async () => DECISION_BYTES } });
});

describe("documentIndexRun", () => {
  it.each([
    ["missing", []],
    ["confirmed again since this job was queued", [record({ reviewedAt: new Date("2026-10-03T12:05:00Z") })]],
    ["not waiting to be indexed", [record({ indexStatus: null })]],
    ["already failed", [record({ indexStatus: "failed" })]],
    ["not linked to a client", [record({ clientId: null })]],
    ["without a stored decision", [record({ decisionS3Key: null })]],
  ])("skips a document that is %s, without reading or indexing anything", async (_case, selected) => {
    results.push(selected);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("skipped");
    expect(s3Send).not.toHaveBeenCalled();
    expect(indexDecision).not.toHaveBeenCalled();
    expect(setArgs()).toEqual([]);
  });

  it("reports an already indexed document as indexed without writing it again", async () => {
    results.push([record({ indexStatus: "indexed" })]);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("indexed");
    expect(indexDecision).not.toHaveBeenCalled();
    expect(setArgs()).toEqual([]);
  });

  it("indexes the stored decision under the document's client, then marks it indexed", async () => {
    results.push([record()], [{ id: DOCUMENT_ID }]);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("indexed");

    const get = s3Send.mock.calls[0]![0];
    expect(get).toBeInstanceOf(GetObjectCommand);
    expect(get.input).toEqual({ Bucket: "documents-bucket", Key: DECISION_KEY });
    expect(indexDecision).toHaveBeenCalledWith(CLIENT_ID, "W-2 2024.pdf", DECISION_BYTES);
    expect(setArgs()).toEqual([{ indexStatus: "indexed" }]);
  });

  it("reports skipped when a newer confirmation replaced the run before the index committed", async () => {
    results.push([record()], []);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("skipped");
    expect(setArgs()).toEqual([{ indexStatus: "indexed" }]);
  });

  it("marks the document failed when the decision can't be indexed", async () => {
    results.push([record()], [{ id: DOCUMENT_ID }]);
    indexDecision.mockRejectedValue(new AppError(KNOWLEDGE_BASE_ERRORS.DECISION_EMPTY));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("failed");
    expect(setArgs()).toEqual([{ indexStatus: "failed" }]);
  });

  it("rethrows an unexpected error so the job retries, leaving the document pending", async () => {
    results.push([record()]);
    indexDecision.mockRejectedValue(new Error("socket hang up"));

    await expect(documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).rejects.toThrow("socket hang up");
    expect(setArgs()).toEqual([]);
  });
});

describe("documentIndexMarkFailed", () => {
  it("fails a pending index", async () => {
    results.push([{ id: DOCUMENT_ID }]);

    expect(await documentIndexMarkFailed(DOCUMENT_ID, REVIEWED_AT)).toBe(true);
    expect(setArgs()).toEqual([{ indexStatus: "failed" }]);
  });

  it("no-ops when the index already settled or was replaced", async () => {
    results.push([]);

    expect(await documentIndexMarkFailed(DOCUMENT_ID, REVIEWED_AT)).toBe(false);
  });
});
