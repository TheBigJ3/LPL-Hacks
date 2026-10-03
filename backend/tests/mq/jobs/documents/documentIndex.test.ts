import { beforeEach, describe, expect, it, vi } from "vitest";

const { bullQueue, indexRun, markFailed, syncProducer } = vi.hoisted(() => ({
  bullQueue: { add: vi.fn() },
  indexRun: vi.fn(),
  markFailed: vi.fn(),
  syncProducer: vi.fn(),
}));

vi.mock("../../../../mq/queues/indexing.js", () => ({
  default: { name: "indexing", concurrency: 2, jobOptions: { attempts: 4 }, queue: () => bullQueue },
}));
vi.mock("../../../../mq/jobs/knowledgeBase/knowledgeBaseSync.js", () => ({ default: { producer: syncProducer } }));
vi.mock("../../../../services/documents/documentIndexMethods.js", () => ({ documentIndexRun: indexRun, documentIndexMarkFailed: markFailed }));

const { default: documentIndex } = await import("../../../../mq/jobs/documents/documentIndex.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const REVIEWED_AT = "2026-10-03T12:00:00.000Z";

const job = (attemptsMade = 0) => ({ data: { documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT }, attemptsMade, opts: { attempts: 4 } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("documentIndex", () => {
  it("keys the job by document and confirmation, so a re-tag queues a new run", async () => {
    await documentIndex.producer({ documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT });

    expect(bullQueue.add).toHaveBeenCalledWith("documentIndex", { documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT }, {
      attempts: 4,
      jobId: `document-index-${DOCUMENT_ID}-${Date.parse(REVIEWED_AT)}`,
    });
  });

  it("queues a knowledge base sync once the document is indexed", async () => {
    indexRun.mockResolvedValue("indexed");

    await expect(documentIndex.handler(job())).resolves.toBe("indexed");
    expect(indexRun).toHaveBeenCalledWith(DOCUMENT_ID, REVIEWED_AT);
    expect(syncProducer).toHaveBeenCalledWith({ requestedAt: expect.any(Number) });
  });

  it.each(["skipped", "failed"])("queues no sync when the run is %s", async (outcome) => {
    indexRun.mockResolvedValue(outcome);

    await expect(documentIndex.handler(job())).resolves.toBe(outcome);
    expect(syncProducer).not.toHaveBeenCalled();
  });

  it("leaves the index pending while retries remain", async () => {
    indexRun.mockRejectedValue(new Error("socket hang up"));

    await expect(documentIndex.handler(job(1))).rejects.toThrow("socket hang up");
    expect(markFailed).not.toHaveBeenCalled();
    expect(syncProducer).not.toHaveBeenCalled();
  });

  it("fails the index on the last attempt", async () => {
    indexRun.mockRejectedValue(new Error("socket hang up"));

    await expect(documentIndex.handler(job(3))).rejects.toThrow("socket hang up");
    expect(markFailed).toHaveBeenCalledWith(DOCUMENT_ID, REVIEWED_AT);
  });
});
