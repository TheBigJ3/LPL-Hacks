import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXTRACTION_ERRORS } from "../../../../types/native/extraction/errors.js";

const { bullQueue, extract, markFailed } = vi.hoisted(() => ({
  bullQueue: { add: vi.fn() },
  extract: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("../../../../mq/queues/extraction.js", () => ({
  default: { name: "extraction", concurrency: 5, jobOptions: { attempts: 5 }, queue: () => bullQueue },
}));
vi.mock("../../../../services/documents/documentMethods.js", () => ({
  documentExtract: extract,
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

  it("returns how the document's extraction ended", async () => {
    extract.mockResolvedValue("extracted");

    expect(await documentExtract.handler(job())).toBe("extracted");
    expect(extract).toHaveBeenCalledWith(DOCUMENT_ID);
  });

  it("lets an early failure retry without touching the document", async () => {
    extract.mockRejectedValue(new Error("throttled"));

    await expect(documentExtract.handler(job(0))).rejects.toThrow("throttled");
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("marks the document failed when its last retry fails, so the client isn't left waiting", async () => {
    extract.mockRejectedValue(new Error("throttled"));

    await expect(documentExtract.handler(job(4))).rejects.toThrow("throttled");
    expect(markFailed).toHaveBeenCalledWith(DOCUMENT_ID, EXTRACTION_ERRORS.EXTRACTION_BUSY.MESSAGE);
  });
});
