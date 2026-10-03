import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/answer/ask.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/answer/ask.js";
import { AppError } from "../../../modules/AppError.js";
import { answerAsk } from "../../../services/answer/answerMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 10,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const parsed = ParamsZod.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(GENERAL_ERRORS.BAD_REQUEST);
  }

  const result = await answerAsk(parsed.data.question, parsed.data.clientId);

  return { success: true, ...result };
};

export default { config, handler };
