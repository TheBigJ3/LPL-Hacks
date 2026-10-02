import { describe, expect, it, vi } from "vitest";

const { Queue, redis_client } = vi.hoisted(() => ({
  Queue: vi.fn(function (this: Record<string, unknown>, name: string) { this.name = name; }),
  redis_client: { status: "ready" },
}));

vi.mock("bullmq", () => ({ Queue }));
vi.mock("../../loaders/redisLoader.js", () => ({ redis_client }));

const { defineQueue } = await import("../../mq/defineQueue.js");

describe("defineQueue", () => {
  it("opens its queue on first use and reuses it after", () => {
    const payments = defineQueue({ name: "payments", concurrency: 5, jobOptions: {} });

    expect(Queue).not.toHaveBeenCalled();

    const first = payments.queue();
    const second = payments.queue();

    expect(first).toBe(second);
    expect(Queue).toHaveBeenCalledTimes(1);
    expect(Queue).toHaveBeenCalledWith("payments", { connection: redis_client });
  });
});
