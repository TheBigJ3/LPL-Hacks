import type { Job } from "bullmq";
import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import extraction from "../../queues/extraction.js";
import { documentExtractCollect, documentMarkFailed } from "../../../services/documents/documentMethods.js";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";

export const DOCUMENT_EXTRACT_POLL_MAX_ATTEMPTS = 120;

const PayloadZod = z.object({
  documentId: z.uuid(),
  attempt: z.number().int().nonnegative(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload, job: Job) => {
  let outcome: Awaited<ReturnType<typeof documentExtractCollect>>;
  try {
    outcome = await documentExtractCollect(payload.documentId);
  } catch (err) {
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await documentMarkFailed(payload.documentId, EXTRACTION_ERRORS.EXTRACTION_BUSY.MESSAGE);
    throw err;
  }

  if (outcome === "settled") return "settled";

  if (payload.attempt + 1 >= DOCUMENT_EXTRACT_POLL_MAX_ATTEMPTS) {
    await documentMarkFailed(payload.documentId, EXTRACTION_ERRORS.EXTRACTION_TIMED_OUT.MESSAGE);
    return "timedOut";
  }

  await documentExtractPoll.producer({ documentId: payload.documentId, attempt: payload.attempt + 1 });
  return "pending";
};

const documentExtractPoll = defineJob({
  name: "documentExtractPoll",
  queue: extraction,
  payload: PayloadZod,
  // Each poll is its own job, since re-enqueuing under the id of the job still running would be dropped as a duplicate.
  jobId: (payload) => `document-extract-poll-${payload.documentId}-${payload.attempt}`,
  delay: (payload) => Math.min(2_000 + payload.attempt * 1_000, 10_000),
  handler,
});

export default documentExtractPoll;
