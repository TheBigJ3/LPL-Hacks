import { defineQueue } from "../defineQueue.js";

// An answer streams to a waiting advisor, so a failed run is marked failed for them to re-ask rather than retried behind their back.
export default defineQueue({
  name: "insight",
  concurrency: 8,
  jobOptions: {
    attempts: 1,
    removeOnComplete: 1_000,
    removeOnFail: 500,
  },
});
