import { defineQueue } from "../defineQueue.js";

// Tagging runs on one GPU endpoint that can be busy or still starting, so few run at once and retries are spread out.
export default defineQueue({
  name: "tagging",
  concurrency: 2,
  jobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: 1_000,
    removeOnFail: 500,
  },
});
