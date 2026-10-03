import { beforeEach, describe, expect, it, vi } from "vitest";

const { bullQueue, indexRun, syncProducer } = vi.hoisted(() => ({
  bullQueue: { add: vi.fn() },
  indexRun: vi.fn(),
  syncProducer: vi.fn(),
}));

vi.mock("../../../../mq/queues/indexing.js", () => ({
  default: { name: "indexing", concurrency: 2, jobOptions: { attempts: 4 }, queue: () => bullQueue },
}));
vi.mock("../../../../mq/jobs/knowledgeBase/knowledgeBaseSync.js", () => ({ default: { producer: syncProducer } }));
vi.mock("../../../../services/notes/noteIndexMethods.js", () => ({ noteIndexRun: indexRun }));

const { default: noteIndex } = await import("../../../../mq/jobs/notes/noteIndex.js");

const NOTE_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const REQUESTED_AT = 1_791_100_000_000;

const job = () => ({ data: { noteId: NOTE_ID, requestedAt: REQUESTED_AT }, attemptsMade: 0, opts: { attempts: 4 } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("noteIndex", () => {
  it("keys the job by note and save, so every edit queues its own run", async () => {
    await noteIndex.producer({ noteId: NOTE_ID, requestedAt: REQUESTED_AT });

    expect(bullQueue.add).toHaveBeenCalledWith("noteIndex", { noteId: NOTE_ID, requestedAt: REQUESTED_AT }, {
      attempts: 4,
      jobId: `note-index-${NOTE_ID}-${REQUESTED_AT}`,
    });
  });

  it.each(["indexed", "removed"])("queues a knowledge base sync once the note is %s", async (outcome) => {
    indexRun.mockResolvedValue(outcome);

    await expect(noteIndex.handler(job())).resolves.toBe(outcome);
    expect(indexRun).toHaveBeenCalledWith(NOTE_ID);
    expect(syncProducer).toHaveBeenCalledWith({ requestedAt: expect.any(Number) });
  });

  it("queues no sync when indexing throws", async () => {
    indexRun.mockRejectedValue(new Error("S3 down"));

    await expect(noteIndex.handler(job())).rejects.toThrow("S3 down");
    expect(syncProducer).not.toHaveBeenCalled();
  });
});
