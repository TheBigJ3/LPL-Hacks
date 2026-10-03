import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../modules/AppError.js";
import { KNOWLEDGE_BASE_ERRORS } from "../../../types/native/knowledgeBase/errors.js";

const { db, results, calls, indexPages } = vi.hoisted(() => {
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
  return { db: chain(), results, calls, indexPages: vi.fn() };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));
vi.mock("../../../services/knowledgeBase/knowledgeBaseDocumentMethods.js", () => ({ knowledgeBaseDocumentIndexPages: indexPages }));

const { documentIndexRun, documentIndexMarkFailed, documentIndexRequeueTagged } = await import("../../../services/documents/documentIndexMethods.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const CLIENT_ID = "6b0f1d3c-1f2a-4c5e-9d8b-7a6c5b4e3d21";
const REVIEWED_AT = "2026-10-03T12:00:00.000Z";
const EXTRACTION = {
  fields: [],
  tables: [],
  lines: [{ text: "W-2 Wage and Tax Statement 2024", confidence: 99, confidenceLevel: "high", page: 1, box: null }],
};
const TAGGING = {
  docType: { choice: "w2", evidence: [] },
  tags: [{ name: "income", source: "docType", evidence: [] }],
  members: [{ memberId: "member-1", name: "Sarah Johnson", basis: "fullName", evidence: [] }],
  taggedAt: REVIEWED_AT,
};

const record = (overrides: Record<string, unknown> = {}) => ({
  fileName: "W-2 2024.pdf",
  clientId: CLIENT_ID,
  pageCount: 1,
  extraction: EXTRACTION,
  reviewedFields: {},
  tagging: TAGGING,
  indexStatus: "pending",
  reviewedAt: new Date(REVIEWED_AT),
  ...overrides,
});

const setArgs = () => calls.filter((call) => call.method === "set").map((call) => call.args[0]);

beforeEach(() => {
  vi.clearAllMocks();
  results.length = 0;
  calls.length = 0;
  indexPages.mockResolvedValue({});
});

describe("documentIndexRun", () => {
  it.each([
    ["missing", []],
    ["confirmed again since this job was queued", [record({ reviewedAt: new Date("2026-10-03T12:05:00Z") })]],
    ["not waiting to be indexed", [record({ indexStatus: null })]],
    ["already failed", [record({ indexStatus: "failed" })]],
    ["not linked to a client", [record({ clientId: null })]],
    ["not extracted", [record({ extraction: null })]],
    ["not tagged", [record({ tagging: null })]],
  ])("skips a document that is %s, without reading or indexing anything", async (_case, selected) => {
    results.push(selected);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("skipped");
    expect(indexPages).not.toHaveBeenCalled();
    expect(setArgs()).toEqual([]);
  });

  it("reports an already indexed document as indexed without writing it again", async () => {
    results.push([record({ indexStatus: "indexed" })]);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("indexed");
    expect(indexPages).not.toHaveBeenCalled();
    expect(setArgs()).toEqual([]);
  });

  it("indexes the document page by page under its own id, then marks it indexed", async () => {
    results.push([record()], [{ id: DOCUMENT_ID }]);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("indexed");

    expect(indexPages).toHaveBeenCalledWith(expect.objectContaining({
      documentId: DOCUMENT_ID,
      clientId: CLIENT_ID,
      fileName: "W-2 2024.pdf",
      docType: "w2",
      taxYear: 2024,
      familyMembers: ["member-1"],
      pages: [{ page: 1, fields: [], lines: ["W-2 Wage and Tax Statement 2024"] }],
    }));
    expect(setArgs()).toEqual([{ indexStatus: "indexed" }]);
  });

  it("reports skipped when a newer confirmation replaced the run before the index committed", async () => {
    results.push([record()], []);

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("skipped");
    expect(setArgs()).toEqual([{ indexStatus: "indexed" }]);
  });

  it("marks the document failed when it has nothing to index", async () => {
    results.push([record()], [{ id: DOCUMENT_ID }]);
    indexPages.mockRejectedValue(new AppError(KNOWLEDGE_BASE_ERRORS.DOCUMENT_EMPTY));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await documentIndexRun(DOCUMENT_ID, REVIEWED_AT)).toBe("failed");
    expect(setArgs()).toEqual([{ indexStatus: "failed" }]);
  });

  it("rethrows an unexpected error so the job retries, leaving the document pending", async () => {
    results.push([record()]);
    indexPages.mockRejectedValue(new Error("socket hang up"));

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

describe("documentIndexRequeueTagged", () => {
  it("marks tagged documents pending and returns them with their review time", async () => {
    results.push([{ id: DOCUMENT_ID, reviewedAt: new Date(REVIEWED_AT) }]);

    expect(await documentIndexRequeueTagged()).toEqual([{ id: DOCUMENT_ID, reviewedAt: REVIEWED_AT }]);
    expect(setArgs()).toEqual([{ indexStatus: "pending" }]);
  });
});
