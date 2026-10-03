import { defineQueue } from "../defineQueue.js";

// Indexing is only S3 writes, so a few quick retries ride out a transient error before the document is marked failed.
export default defineQueue({
  name: "indexing",
  concurrency: 2,
  jobOptions: {
    attempts: 4,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1_000,
    removeOnFail: 500,
  },
});
