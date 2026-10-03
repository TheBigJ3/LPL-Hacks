import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import knowledgeBase from "../../queues/knowledgeBase.js";
import { knowledgeBaseDocumentSyncStart } from "../../../services/knowledgeBase/knowledgeBaseDocumentMethods.js";

const SYNC_WINDOW_MS = 30_000;

const PayloadZod = z.object({
  requestedAt: z.number().int().nonnegative(),
});

type Payload = z.infer<typeof PayloadZod>;

function knowledgeBaseSyncWindow(payload: Payload): number {
  return Math.floor(payload.requestedAt / SYNC_WINDOW_MS);
}

const handler = async (payload: Payload) => {
  const ingestionJobId = await knowledgeBaseDocumentSyncStart(knowledgeBaseSyncWindow(payload));
  return ingestionJobId ? `ingestion ${ingestionJobId}` : undefined;
};

// Every write inside one window collapses into one sync that starts when the window closes.
export default defineJob({
  name: "knowledgeBaseSync",
  queue: knowledgeBase,
  payload: PayloadZod,
  jobId: (payload) => `knowledge-base-sync-${knowledgeBaseSyncWindow(payload)}`,
  delay: (payload) => (knowledgeBaseSyncWindow(payload) + 1) * SYNC_WINDOW_MS - Date.now(),
  handler,
});
