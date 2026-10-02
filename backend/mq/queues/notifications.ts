import { defineQueue } from "../defineQueue.js";

export default defineQueue({
  name: "notifications",
  concurrency: 10,
  jobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1_000,
    removeOnFail: 500,
  },
});
