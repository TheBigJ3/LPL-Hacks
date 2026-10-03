import type { z } from "zod";
import type { ParamsZod } from "../../../../zod/api/v1/insight/get.js";
import type { InsightConversation } from "../../../insight/insightMessage.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  conversation: InsightConversation;
};
