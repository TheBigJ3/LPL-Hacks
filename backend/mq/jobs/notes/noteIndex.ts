import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import indexing from "../../queues/indexing.js";
import knowledgeBaseSync from "../knowledgeBase/knowledgeBaseSync.js";
import { noteIndexRun } from "../../../services/notes/noteIndexMethods.js";

const PayloadZod = z.object({
  noteId: z.uuid(),
  requestedAt: z.number().int().nonnegative(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload) => {
  const outcome = await noteIndexRun(payload.noteId);
  await knowledgeBaseSync.producer({ requestedAt: Date.now() });
  return outcome;
};

export default defineJob({
  name: "noteIndex",
  queue: indexing,
  payload: PayloadZod,
  jobId: (payload) => `note-index-${payload.noteId}-${payload.requestedAt}`,
  handler,
});
