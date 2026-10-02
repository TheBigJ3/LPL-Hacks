import { defineQueue } from "../defineQueue.js";

// Housekeeping the next scheduled run repeats anyway, so a few slow retries are plenty.
export default defineQueue({
  name: "maintenance",
  concurrency: 1,
  jobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
