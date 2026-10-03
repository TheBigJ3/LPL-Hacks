import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../modules/AppError.js";
import { DOCUMENT_ERRORS } from "../../../../types/native/documents/errors.js";
import { OPENDECISION_ERRORS } from "../../../../types/native/opendecision/errors.js";

const { bullQueue, tagRun, markFailed, indexProducer } = vi.hoisted(() => ({ bullQueue: { add: vi.fn() }, tagRun: vi.fn(), markFailed: vi.fn(), indexProducer: vi.fn() }));

vi.mock("../../../../mq/queues/tagging.js", () => ({
  default: { name: "tagging", concurrency: 2, jobOptions: { attempts: 4 }, queue: () => bullQueue },
}));
vi.mock("../../../../mq/jobs/documents/documentIndex.js", () => ({ default: { producer: indexProducer } }));
vi.mock("../../../../services/documents/documentTagMethods.js", () => ({ documentTagRun: tagRun, documentTagMarkFailed: markFailed }));

const { default: documentTag } = await import("../../../../mq/jobs/documents/documentTag.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const REVIEWED_AT = "2026-10-03T12:00:00.000Z";

const job = (attemptsMade = 0) => ({ data: { documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT }, attemptsMade, opts: { attempts: 4 } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("documentTag", () => {
  it("keys the job by document and confirmation, so confirming again queues a new run", async () => {
    await documentTag.producer({ documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT });

    expect(bullQueue.add).toHaveBeenCalledWith("documentTag", { documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT }, {
      attempts: 4,
      jobId: `document-tag-${DOCUMENT_ID}-${Date.parse(REVIEWED_AT)}`,
    });
  });

  it.each(["tagged", "skipped"])("queues indexing for this confirmation when the run is %s", async (outcome) => {
    tagRun.mockResolvedValue(outcome);

    await expect(documentTag.handler(job())).resolves.toBe(outcome);
    expect(indexProducer).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT });
  });

  it("queues no indexing when tagging failed", async () => {
    tagRun.mockResolvedValue("failed");

    await expect(documentTag.handler(job())).resolves.toBe("failed");
    expect(indexProducer).not.toHaveBeenCalled();
  });

  it("leaves the tagging pending while retries remain", async () => {
    tagRun.mockRejectedValue(new AppError(OPENDECISION_ERRORS.ANALYSIS_BUSY));

    await expect(documentTag.handler(job(1))).rejects.toBeInstanceOf(AppError);
    expect(markFailed).not.toHaveBeenCalled();
    expect(indexProducer).not.toHaveBeenCalled();
  });

  it("fails the tagging with the error's message on the last attempt", async () => {
    tagRun.mockRejectedValue(new AppError(OPENDECISION_ERRORS.ANALYSIS_BUSY));

    await expect(documentTag.handler(job(3))).rejects.toBeInstanceOf(AppError);
    expect(markFailed).toHaveBeenCalledWith(DOCUMENT_ID, REVIEWED_AT, OPENDECISION_ERRORS.ANALYSIS_BUSY.MESSAGE);
  });

  it("hides an unexpected error's detail behind the generic message", async () => {
    tagRun.mockRejectedValue(new Error("socket hang up"));

    await expect(documentTag.handler(job(3))).rejects.toThrow("socket hang up");
    expect(markFailed).toHaveBeenCalledWith(DOCUMENT_ID, REVIEWED_AT, DOCUMENT_ERRORS.TAGGING_FAILED.MESSAGE);
  });
});
