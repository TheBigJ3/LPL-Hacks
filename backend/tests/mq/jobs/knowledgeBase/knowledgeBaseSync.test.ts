import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { add, knowledgeBaseDocumentSyncStart } = vi.hoisted(() => ({ add: vi.fn(), knowledgeBaseDocumentSyncStart: vi.fn() }));

vi.mock("../../../../mq/queues/knowledgeBase.js", () => ({
  default: { name: "knowledgeBase", concurrency: 1, jobOptions: { attempts: 8 }, queue: () => ({ add }) },
}));
vi.mock("../../../../services/knowledgeBase/knowledgeBaseDocumentMethods.js", () => ({ knowledgeBaseDocumentSyncStart }));

const { default: knowledgeBaseSync } = await import("../../../../mq/jobs/knowledgeBase/knowledgeBaseSync.js");

const WINDOW_START = 1_800_000_000_000 - (1_800_000_000_000 % 30_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("knowledgeBaseSync.producer", () => {
  it("collapses writes in the same window into one job that runs when the window closes", async () => {
    vi.setSystemTime(WINDOW_START + 10_000);

    await knowledgeBaseSync.producer({ requestedAt: WINDOW_START + 1_000 });
    await knowledgeBaseSync.producer({ requestedAt: WINDOW_START + 29_999 });

    const window = WINDOW_START / 30_000;
    expect(add).toHaveBeenNthCalledWith(1, "knowledgeBaseSync", { requestedAt: WINDOW_START + 1_000 }, { attempts: 8, jobId: `knowledge-base-sync-${window}`, delay: 20_000 });
    expect(add.mock.calls[1]![2]).toMatchObject({ jobId: `knowledge-base-sync-${window}` });
  });

  it("gives the next window its own job", async () => {
    vi.setSystemTime(WINDOW_START + 30_000);

    await knowledgeBaseSync.producer({ requestedAt: WINDOW_START + 30_000 });

    expect(add.mock.calls[0]![2]).toMatchObject({ jobId: `knowledge-base-sync-${WINDOW_START / 30_000 + 1}`, delay: 30_000 });
  });

  it("never schedules a negative delay for a window that already closed", async () => {
    vi.setSystemTime(WINDOW_START + 90_000);

    await knowledgeBaseSync.producer({ requestedAt: WINDOW_START });

    expect(add.mock.calls[0]![2]).toMatchObject({ delay: 0 });
  });
});

describe("knowledgeBaseSync.handler", () => {
  it("starts ingestion for the payload's window and reports the ingestion id", async () => {
    knowledgeBaseDocumentSyncStart.mockResolvedValue("ing-1");

    await expect(knowledgeBaseSync.handler({ data: { requestedAt: WINDOW_START + 5 } } as any)).resolves.toBe("ingestion ing-1");
    expect(knowledgeBaseDocumentSyncStart).toHaveBeenCalledWith(WINDOW_START / 30_000);
  });
});
