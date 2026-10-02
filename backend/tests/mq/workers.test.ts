import { beforeEach, describe, expect, it, vi } from "vitest";

const { Worker } = vi.hoisted(() => ({
  Worker: vi.fn(function (this: Record<string, unknown>, name: string, processor: unknown, options: unknown) {
    this.name = name;
    this.processor = processor;
    this.options = options;
    this.on = vi.fn();
  }),
}));

vi.mock("bullmq", () => ({ Worker }));
vi.mock("../../loaders/redisLoader.js", () => ({ createRedisConnection: vi.fn(() => "connection") }));

const { startWorkersFor } = await import("../../mq/workers.js");
const { jobScope } = await import("../../modules/jobScope.js");

const queue = (name: string, concurrency = 1) => ({ name, concurrency, jobOptions: {}, queue: vi.fn() });

const job = (name: string, onQueue: ReturnType<typeof queue>, extra: Record<string, unknown> = {}) => ({
  name,
  queue: onQueue,
  handler: vi.fn(async () => undefined),
  producer: vi.fn(async () => undefined),
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("startWorkersFor", () => {
  it("starts one worker per queue at that queue's concurrency", async () => {
    const extraction = queue("extraction", 10);
    const bestEffort = queue("bestEffort", 5);

    await startWorkersFor([job("documentExtract", extraction), job("documentTag", extraction), job("documentIndex", bestEffort)] as any);

    expect(Worker.mock.calls.map((call) => [call[0], (call[2] as { concurrency: number }).concurrency])).toEqual([["extraction", 10], ["bestEffort", 5]]);
  });

  it("routes each job to its own handler", async () => {
    const extraction = queue("extraction");
    const fulfill = job("documentExtract", extraction);
    const release = job("documentTag", extraction);
    const [worker] = await startWorkersFor([fulfill, release] as any);
    const bullJob = { name: "documentTag", data: {} };

    await (worker as any).processor(bullJob);

    expect(release.handler).toHaveBeenCalledWith(bullJob);
    expect(fulfill.handler).not.toHaveBeenCalled();
  });

  it("runs every job inside the job scope, so its queries use the job pool", async () => {
    const extraction = queue("extraction");
    let scoped: unknown;
    const fulfill = job("documentExtract", extraction, { handler: vi.fn(async () => { scoped = jobScope.getStore(); }) });
    const [worker] = await startWorkersFor([fulfill] as any);

    await (worker as any).processor({ name: "documentExtract", data: {} });

    expect(scoped).toBe(true);
    expect(jobScope.getStore()).toBeUndefined();
  });

  it("fails a job whose name has no file on its queue", async () => {
    const [worker] = await startWorkersFor([job("documentExtract", queue("extraction"))] as any);

    await expect((worker as any).processor({ name: "documentUnknown", data: {} })).rejects.toMatchObject({
      _servermessage: expect.stringContaining("No handler registered for extraction/documentUnknown"),
    });
  });

  it("starts every schedule and nothing else", async () => {
    const maintenance = queue("maintenance");
    const scheduled = job("documentCleanup", maintenance, { schedule: { id: "cleanup", every: 1_000 } });
    const plain = job("documentExtract", queue("extraction"));

    await startWorkersFor([scheduled, plain] as any);

    expect(scheduled.producer).toHaveBeenCalled();
    expect(plain.producer).not.toHaveBeenCalled();
  });

  it("refuses to boot when two job files share a name", async () => {
    await expect(startWorkersFor([job("documentExtract", queue("extraction")), job("documentExtract", queue("bestEffort"))] as any)).rejects.toThrow();
  });

  it("refuses to boot when two queue files share a name", async () => {
    await expect(startWorkersFor([job("documentExtract", queue("extraction")), job("documentTag", queue("extraction"))] as any)).rejects.toThrow();
  });
});
