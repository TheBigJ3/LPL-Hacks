import type { Job } from "bullmq";
import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import tagging from "../../queues/tagging.js";
import { AppError } from "../../../modules/AppError.js";
import { documentTagMarkFailed, documentTagRun } from "../../../services/documents/documentTagMethods.js";
import { DOCUMENT_ERRORS } from "../../../types/native/documents/errors.js";

const PayloadZod = z.object({
  documentId: z.uuid(),
  reviewedAt: z.iso.datetime(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload, job: Job) => {
  try {
    return await documentTagRun(payload.documentId, payload.reviewedAt);
  } catch (err) {
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await documentTagMarkFailed(payload.documentId, payload.reviewedAt, err instanceof AppError ? err.message : DOCUMENT_ERRORS.TAGGING_FAILED.MESSAGE);
    }
    throw err;
  }
};

export default defineJob({
  name: "documentTag",
  queue: tagging,
  payload: PayloadZod,
  jobId: (payload) => `document-tag-${payload.documentId}-${Date.parse(payload.reviewedAt)}`,
  handler,
});
