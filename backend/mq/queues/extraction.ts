import { defineQueue } from "../defineQueue.js";

// Textract throttles under load, so a few spaced-out retries ride that out before the document is marked failed.
export default defineQueue({
  name: "extraction",
  concurrency: 5,
  jobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1_000,
    removeOnFail: 500,
  },
});
