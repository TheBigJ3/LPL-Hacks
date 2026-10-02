import type { WriteFn } from "metrichouse/core";
import { clickhouse_client } from "../loaders/clickhouseLoader.js";

const METRICS_INSERT_MAX_ROWS = 10_000;

// Kept well under the ioredis driver's 5m recoverAfter, so a slow insert is never mistaken for a dead flusher.
const METRICS_INSERT_TIMEOUT_MS = 15_000;

export function metricsSinkClickHouse(table: string): WriteFn {
  return async (rows) => {
    for (let start = 0; start < rows.length; start += METRICS_INSERT_MAX_ROWS) {
      await clickhouse_client.insert({
        table,
        values: rows.slice(start, start + METRICS_INSERT_MAX_ROWS),
        format: "JSONEachRow",
        abort_signal: AbortSignal.timeout(METRICS_INSERT_TIMEOUT_MS),
        clickhouse_settings: {
          // MetricHouse already hands over whole batches, so the server-side async buffer would only delay the ack.
          async_insert: 0,
          date_time_input_format: "best_effort",
        },
      });
    }
  };
}
