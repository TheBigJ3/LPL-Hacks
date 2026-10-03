import type { Job } from "bullmq";
import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import indexing from "../../queues/indexing.js";
import knowledgeBaseSync from "../knowledgeBase/knowledgeBaseSync.js";
import { documentIndexMarkFailed, documentIndexRun } from "../../../services/documents/documentIndexMethods.js";

const PayloadZod = z.object({
  documentId: z.uuid(),
  reviewedAt: z.iso.datetime(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload, job: Job) => {
  let outcome;
  try {
    outcome = await documentIndexRun(payload.documentId, payload.reviewedAt);
  } catch (err) {
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await documentIndexMarkFailed(payload.documentId, payload.reviewedAt);
    throw err;
  }

  if (outcome === "indexed") await knowledgeBaseSync.producer({ requestedAt: Date.now() });
  return outcome;
};

export default defineJob({
  name: "documentIndex",
  queue: indexing,
  payload: PayloadZod,
  jobId: (payload) => `document-index-${payload.documentId}-${Date.parse(payload.reviewedAt)}`,
  handler,
});
