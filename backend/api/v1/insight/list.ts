import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/insight/list.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/list.js";
import { AppError } from "../../../modules/AppError.js";
import { insightConversationList } from "../../../services/insight/insightConversationMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "GET",
  rateLimitPoints: 1,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.query);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  return { success: true, conversations: await insightConversationList(req.user.userId, params.data.clientId) };
};

export default { config, handler };
