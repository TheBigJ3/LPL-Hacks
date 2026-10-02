import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock, pipelineSet, pipelineExec } = vi.hoisted(() => {
  const pipelineSet = vi.fn();
  const pipelineExec = vi.fn();
  return {
    redisMock: { eval: vi.fn(), set: vi.fn(), pipeline: vi.fn(() => ({ set: pipelineSet, exec: pipelineExec })) },
    pipelineSet,
    pipelineExec,
  };
});

vi.mock("../../../loaders/redisLoader.js", () => ({ redis_client: redisMock }));

const { cacheBust, cacheDefine } = await import("../../../services/cache/cacheMethods.js");

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

const TEST_CACHE = cacheDefine<{ name: string }>({ name: "testEvent", shape: 2, ttlSeconds: 600 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  redisMock.set.mockResolvedValue("OK");
  pipelineExec.mockResolvedValue([[null, "OK"]]);
});

describe("cacheDefine", () => {
  it("refuses a second cache with a name already taken", () => {
    expect(() => cacheDefine({ name: "testEvent", shape: 1, ttlSeconds: 60 })).toThrow(expect.objectContaining({ _servermessage: "[cache] Two caches are both named testEvent" }));
  });

  it("refuses a ttl that would outlive the version that busts it", () => {
    expect(() => cacheDefine({ name: "testForever", shape: 1, ttlSeconds: 30 * 24 * 60 * 60 })).toThrow(expect.objectContaining({ _servermessage: expect.stringContaining("would outlive") }));
  });
});

describe("remember", () => {
  it("serves a cached value without loading", async () => {
    redisMock.eval.mockResolvedValue(["v1", JSON.stringify({ name: "Cached" })]);
    const load = vi.fn();

    await expect(TEST_CACHE.remember(load, EVENT_ID)).resolves.toEqual({ name: "Cached" });

    expect(redisMock.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `cache:{testEvent:${EVENT_ID}}:version`,
      `cache:{testEvent:${EVENT_ID}}:value:2:`,
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("loads a miss and stores it under the version it read", async () => {
    redisMock.eval.mockResolvedValue(["v1", null]);
    const load = vi.fn().mockResolvedValue({ name: "Fresh" });

    await expect(TEST_CACHE.remember(load, EVENT_ID)).resolves.toEqual({ name: "Fresh" });

    expect(redisMock.set).toHaveBeenCalledWith(`cache:{testEvent:${EVENT_ID}}:value:2:v1`, JSON.stringify({ name: "Fresh" }), "EX", 600);
  });

  it("shares one load between misses that arrive together", async () => {
    redisMock.eval.mockResolvedValue(["v1", null]);
    let finish!: (value: { name: string }) => void;
    const load = vi.fn(() => new Promise<{ name: string }>((resolve) => { finish = resolve; }));

    const first = TEST_CACHE.remember(load, EVENT_ID);
    const second = TEST_CACHE.remember(load, EVENT_ID);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    finish({ name: "Fresh" });

    await expect(Promise.all([first, second])).resolves.toEqual([{ name: "Fresh" }, { name: "Fresh" }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads again after a failed load instead of replaying the failure", async () => {
    redisMock.eval.mockResolvedValue(["v1", null]);
    const load = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce({ name: "Fresh" });

    await expect(TEST_CACHE.remember(load, EVENT_ID)).rejects.toThrow("db down");
    await expect(TEST_CACHE.remember(load, EVENT_ID)).resolves.toEqual({ name: "Fresh" });

    expect(redisMock.set).toHaveBeenCalledTimes(1);
  });

  it("loads straight through when the cache can't be read", async () => {
    redisMock.eval.mockRejectedValue(new Error("redis down"));
    const load = vi.fn().mockResolvedValue({ name: "Fresh" });

    await expect(TEST_CACHE.remember(load, EVENT_ID)).resolves.toEqual({ name: "Fresh" });

    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("still answers when the fresh value can't be stored", async () => {
    redisMock.eval.mockResolvedValue(["v1", null]);
    redisMock.set.mockRejectedValue(new Error("redis down"));

    await expect(TEST_CACHE.remember(async () => ({ name: "Fresh" }), EVENT_ID)).resolves.toEqual({ name: "Fresh" });
  });

  it("keys a cache with no id as its whole", async () => {
    redisMock.eval.mockResolvedValue(["0", JSON.stringify({ name: "Cached" })]);

    await TEST_CACHE.remember(vi.fn());

    expect(redisMock.eval).toHaveBeenCalledWith(expect.any(String), 1, "cache:{testEvent:all}:version", "cache:{testEvent:all}:value:2:");
  });
});

describe("cacheBust", () => {
  it("moves every named entry to a new version that outlives its values", async () => {
    await cacheBust(TEST_CACHE.key(), TEST_CACHE.key(EVENT_ID));

    expect(pipelineSet).toHaveBeenCalledWith("cache:{testEvent:all}:version", expect.any(String), "EX", 30 * 24 * 60 * 60);
    expect(pipelineSet).toHaveBeenCalledWith(`cache:{testEvent:${EVENT_ID}}:version`, expect.any(String), "EX", 30 * 24 * 60 * 60);
    expect(pipelineSet.mock.calls[0]![1]).not.toBe(pipelineSet.mock.calls[1]![1]);
  });

  it("never fails the write it follows", async () => {
    pipelineExec.mockResolvedValue([[new Error("READONLY"), null]]);
    await expect(cacheBust(TEST_CACHE.key(EVENT_ID))).resolves.toBeUndefined();

    pipelineExec.mockRejectedValue(new Error("redis down"));
    await expect(cacheBust(TEST_CACHE.key(EVENT_ID))).resolves.toBeUndefined();
  });
});
