import { defineQueue } from "../defineQueue.js";

// Bedrock refuses a new ingestion while one is still running, so retries back off long enough for the running one to finish.
export default defineQueue({
  name: "knowledgeBase",
  concurrency: 1,
  jobOptions: {
    attempts: 8,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
