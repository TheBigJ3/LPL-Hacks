import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/insight/ask.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/ask.js";
import insightAnswer from "../../../mq/jobs/insight/insightAnswer.js";
import { AppError } from "../../../modules/AppError.js";
import { insightConversationAsk } from "../../../services/insight/insightConversationMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 10,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.body);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  const { clientId, conversationId, message } = params.data;
  const result = await insightConversationAsk(req.user.userId, clientId, conversationId, message);
  const answer = result.messages.find((entry) => entry.role === "assistant")!;
  await insightAnswer.producer({ messageId: answer.id });

  return { success: true, ...result };
};

export default { config, handler };
