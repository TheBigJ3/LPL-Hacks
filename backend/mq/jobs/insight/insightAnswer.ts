import { z } from "zod";
import { defineJob } from "../../defineJob.js";
import insight from "../../queues/insight.js";
import { insightAnswerRun } from "../../../services/insight/insightAnswerMethods.js";

const PayloadZod = z.object({
  messageId: z.uuid(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload) => insightAnswerRun(payload.messageId);

export default defineJob({
  name: "insightAnswer",
  queue: insight,
  payload: PayloadZod,
  jobId: (payload) => `insight-answer-${payload.messageId}`,
  handler,
});
