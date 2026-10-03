import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXTRACTION_ERRORS } from "../../../../types/native/extraction/errors.js";

const { bullQueue, extractCollect, markFailed } = vi.hoisted(() => ({
  bullQueue: { add: vi.fn() },
  extractCollect: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("../../../../mq/queues/extraction.js", () => ({
  default: { name: "extraction", concurrency: 5, jobOptions: { attempts: 5 }, queue: () => bullQueue },
}));
vi.mock("../../../../services/documents/documentMethods.js", () => ({
  documentExtractCollect: extractCollect,
  documentMarkFailed: markFailed,
}));

const { default: documentExtractPoll, DOCUMENT_EXTRACT_POLL_MAX_ATTEMPTS } = await import("../../../../mq/jobs/documents/documentExtractPoll.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";

const job = (attempt: number, attemptsMade = 0) => ({ data: { documentId: DOCUMENT_ID, attempt }, attemptsMade, opts: { attempts: 5 } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("documentExtractPoll", () => {
  it("re-enqueues itself as the next attempt, waiting longer each time up to ten seconds", async () => {
    extractCollect.mockResolvedValue("pending");

    expect(await documentExtractPoll.handler(job(3))).toBe("pending");
    await documentExtractPoll.handler(job(40));

    expect(bullQueue.add.mock.calls).toEqual([
      ["documentExtractPoll", { documentId: DOCUMENT_ID, attempt: 4 }, { attempts: 5, jobId: `document-extract-poll-${DOCUMENT_ID}-4`, delay: 6_000 }],
      ["documentExtractPoll", { documentId: DOCUMENT_ID, attempt: 41 }, { attempts: 5, jobId: `document-extract-poll-${DOCUMENT_ID}-41`, delay: 10_000 }],
    ]);
  });

  it("stops polling once the document has settled", async () => {
    extractCollect.mockResolvedValue("settled");

    expect(await documentExtractPoll.handler(job(3))).toBe("settled");
    expect(bullQueue.add).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("gives up on its last allowed attempt and marks the document timed out", async () => {
    extractCollect.mockResolvedValue("pending");

    expect(await documentExtractPoll.handler(job(DOCUMENT_EXTRACT_POLL_MAX_ATTEMPTS - 1))).toBe("timedOut");
    expect(markFailed).toHaveBeenCalledWith(DOCUMENT_ID, EXTRACTION_ERRORS.EXTRACTION_TIMED_OUT.MESSAGE);
    expect(bullQueue.add).not.toHaveBeenCalled();
  });

  it("marks the document failed only when the poll's last retry fails", async () => {
    extractCollect.mockRejectedValue(new Error("throttled"));

    await expect(documentExtractPoll.handler(job(3, 0))).rejects.toThrow("throttled");
    expect(markFailed).not.toHaveBeenCalled();

    await expect(documentExtractPoll.handler(job(3, 4))).rejects.toThrow("throttled");
    expect(markFailed).toHaveBeenCalledWith(DOCUMENT_ID, EXTRACTION_ERRORS.EXTRACTION_BUSY.MESSAGE);
  });
});
