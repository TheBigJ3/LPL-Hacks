import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { defineJob, defineSchedule } = await import("../../mq/defineJob.js");

const bullQueue = { add: vi.fn(), upsertJobScheduler: vi.fn() };
const queue = { name: "fulfillment", concurrency: 1, jobOptions: { attempts: 8 }, queue: () => bullQueue } as any;
const NOW = new Date("2026-09-23T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("defineJob", () => {
  const handled = vi.fn(async () => "done");

  const job = defineJob({
    name: "orderFulfill",
    queue,
    payload: z.object({ orderId: z.string() }),
    jobId: (payload) => `order-fulfill-${payload.orderId}`,
    handler: handled,
  });

  it("enqueues under its name with the queue's options and its own id", async () => {
    await job.producer({ orderId: "order-1" });

    expect(bullQueue.add).toHaveBeenCalledWith("orderFulfill", { orderId: "order-1" }, { attempts: 8, jobId: "order-fulfill-order-1" });
  });

  it("hands the handler a validated payload and returns its outcome", async () => {
    expect(await job.handler({ data: { orderId: "order-1" } } as any)).toBe("done");
    expect(handled).toHaveBeenCalledWith({ orderId: "order-1" }, expect.anything());
  });

  it("rejects a payload that does not match before the handler runs", async () => {
    await expect(job.handler({ data: {} } as any)).rejects.toThrow();
    expect(handled).not.toHaveBeenCalled();
  });

  it("delays until the job's own time and never schedules into the past", async () => {
    const delayed = defineJob({
      name: "ticketTransferExpire",
      queue,
      payload: z.object({ runAt: z.number() }),
      jobId: (payload) => `expire-${payload.runAt}`,
      delay: (payload) => payload.runAt - Date.now(),
      handler: async () => undefined,
    });

    await delayed.producer({ runAt: NOW.getTime() + 60_000 });
    await delayed.producer({ runAt: NOW.getTime() - 60_000 });

    expect(bullQueue.add.mock.calls.map((call) => call[2].delay)).toEqual([60_000, 0]);
  });
});

describe("defineSchedule", () => {
  it("upserts one scheduler under its fixed id with the queue's options", async () => {
    const schedule = defineSchedule({ name: "jobRequestCleanup", queue, schedule: { id: "cleanup", every: 1_000 }, handler: async () => undefined });

    await schedule.producer(undefined);

    expect(bullQueue.upsertJobScheduler).toHaveBeenCalledWith("cleanup", { every: 1_000 }, { name: "jobRequestCleanup", data: {}, opts: { attempts: 8 } });
  });
});
