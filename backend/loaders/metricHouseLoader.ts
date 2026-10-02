import { createHouse } from "metrichouse/core";
import { ioredis } from "metrichouse/ioredis";
import { redis_client } from "./redisLoader.js";
import * as metricsSchema from "../metrics/index.js";

export const metric_house = createHouse({
  driver: ioredis(redis_client),
  schema: metricsSchema,
  delivery: "staged",
  defaults: { flush: "1m" },
  onError: (error, { metric }) => console.error(`[metricHouse] ${metric} failed:`, error),
  onWarn: (message, { metric }) => console.warn(`[metricHouse] ${metric ?? "house"}: ${message}`),
});
