import type { z } from "zod";
import type { ParamsZod } from "../../../../zod/api/v1/insight/rename.js";
import type { InsightConversationSummary } from "../../../insight/insightMessage.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  conversation: InsightConversationSummary;
};
