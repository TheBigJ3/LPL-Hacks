import type { Job } from "bullmq";
import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import extraction from "../../queues/extraction.js";
import { documentExtract, documentMarkFailed } from "../../../services/documents/documentMethods.js";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";

const PayloadZod = z.object({
  documentId: z.uuid(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload, job: Job) => {
  try {
    return await documentExtract(payload.documentId);
  } catch (err) {
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await documentMarkFailed(payload.documentId, EXTRACTION_ERRORS.EXTRACTION_BUSY.MESSAGE);
    throw err;
  }
};

export default defineJob({
  name: "documentExtract",
  queue: extraction,
  payload: PayloadZod,
  jobId: (payload) => `document-extract-${payload.documentId}`,
  handler,
});
