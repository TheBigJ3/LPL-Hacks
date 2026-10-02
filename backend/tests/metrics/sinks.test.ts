import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock("../../loaders/clickhouseLoader.js", () => ({ clickhouse_client: { insert } }));

const { metricsSinkClickHouse } = await import("../../metrics/sinks.js");

const context = { metric: "page_views", kind: "event", bucketFrom: 0, bucketTo: 1, total: 0, attempt: 1, source: "flush" } as const;

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }));

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue(undefined);
});

describe("metricsSinkClickHouse", () => {
  it("inserts a batch into the metric's table in one call", async () => {
    const batch = rows(3);

    await metricsSinkClickHouse("page_views")(batch, context);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      table: "page_views",
      values: batch,
      format: "JSONEachRow",
      abort_signal: expect.any(AbortSignal),
      clickhouse_settings: { async_insert: 0, date_time_input_format: "best_effort" },
    }));
  });

  it("splits a backlog larger than one insert into ordered chunks", async () => {
    const batch = rows(10_001);

    await metricsSinkClickHouse("page_views")(batch, context);

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0].values).toEqual(batch.slice(0, 10_000));
    expect(insert.mock.calls[1][0].values).toEqual(batch.slice(10_000));
  });

  it("sends nothing for an empty batch", async () => {
    await metricsSinkClickHouse("page_views")([], context);

    expect(insert).not.toHaveBeenCalled();
  });

  it("rethrows a failed insert so MetricHouse keeps the rows for the next flush", async () => {
    insert.mockRejectedValueOnce(new Error("clickhouse unavailable"));

    await expect(metricsSinkClickHouse("page_views")(rows(2), context)).rejects.toThrow("clickhouse unavailable");
  });

  it("stops at the failed chunk instead of sending the ones after it", async () => {
    insert.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("timed out"));

    await expect(metricsSinkClickHouse("page_views")(rows(20_001), context)).rejects.toThrow("timed out");

    expect(insert).toHaveBeenCalledTimes(2);
  });
});
