import type { Job } from "bullmq";
import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import extraction from "../../queues/extraction.js";
import { documentExtractStart, documentMarkFailed } from "../../../services/documents/documentMethods.js";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";
import documentExtractPoll from "./documentExtractPoll.js";

const PayloadZod = z.object({
  documentId: z.uuid(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload, job: Job) => {
  let started: boolean;
  try {
    started = await documentExtractStart(payload.documentId);
  } catch (err) {
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await documentMarkFailed(payload.documentId, EXTRACTION_ERRORS.EXTRACTION_BUSY.MESSAGE);
    throw err;
  }

  if (!started) return "skipped";
  await documentExtractPoll.producer({ documentId: payload.documentId, attempt: 0 });
  return "started";
};

export default defineJob({
  name: "documentExtract",
  queue: extraction,
  payload: PayloadZod,
  jobId: (payload) => `document-extract-${payload.documentId}`,
  handler,
});
