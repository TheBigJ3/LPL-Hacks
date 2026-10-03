import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXTRACTION_ERRORS } from "../../../../types/native/extraction/errors.js";

const { bullQueue, extractStart, markFailed } = vi.hoisted(() => ({
  bullQueue: { add: vi.fn() },
  extractStart: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("../../../../mq/queues/extraction.js", () => ({
  default: { name: "extraction", concurrency: 5, jobOptions: { attempts: 5 }, queue: () => bullQueue },
}));
vi.mock("../../../../services/documents/documentMethods.js", () => ({
  documentExtractStart: extractStart,
  documentExtractCollect: vi.fn(),
  documentMarkFailed: markFailed,
}));

const { default: documentExtract } = await import("../../../../mq/jobs/documents/documentExtract.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";

const job = (attemptsMade = 0) => ({ data: { documentId: DOCUMENT_ID }, attemptsMade, opts: { attempts: 5 } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("documentExtract", () => {
  it("enqueues under the document's id so a duplicate upload event collapses", async () => {
    await documentExtract.producer({ documentId: DOCUMENT_ID });

    expect(bullQueue.add).toHaveBeenCalledWith("documentExtract", { documentId: DOCUMENT_ID }, { attempts: 5, jobId: `document-extract-${DOCUMENT_ID}` });
  });

  it("hands off to the first poll once Textract has started", async () => {
    extractStart.mockResolvedValue(true);

    expect(await documentExtract.handler(job())).toBe("started");
    expect(bullQueue.add).toHaveBeenCalledWith(
      "documentExtractPoll",
      { documentId: DOCUMENT_ID, attempt: 0 },
      { attempts: 5, jobId: `document-extract-poll-${DOCUMENT_ID}-0`, delay: 2_000 },
    );
  });

  it("enqueues no poll for a document that is already settled", async () => {
    extractStart.mockResolvedValue(false);

    expect(await documentExtract.handler(job())).toBe("skipped");
    expect(bullQueue.add).not.toHaveBeenCalled();
  });

  it("lets an early failure retry without touching the document", async () => {
    extractStart.mockRejectedValue(new Error("throttled"));

    await expect(documentExtract.handler(job(0))).rejects.toThrow("throttled");
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("marks the document failed when its last retry fails, so the client isn't left waiting", async () => {
    extractStart.mockRejectedValue(new Error("throttled"));

    await expect(documentExtract.handler(job(4))).rejects.toThrow("throttled");
    expect(markFailed).toHaveBeenCalledWith(DOCUMENT_ID, EXTRACTION_ERRORS.EXTRACTION_BUSY.MESSAGE);
  });
});
