import { defineQueue } from "../defineQueue.js";

// Whatever triggered the job triggers it again soon (a buyer's next poll), so a failure is never retried and only a few are kept to diagnose.
export default defineQueue({
  name: "bestEffort",
  concurrency: 5,
  jobOptions: {
    attempts: 1,
    removeOnComplete: 1_000,
    removeOnFail: 100,
  },
});
