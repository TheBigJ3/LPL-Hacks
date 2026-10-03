import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/uploadRequests/list.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/list.js";
import { AppError } from "../../../modules/AppError.js";
import { uploadRequestList } from "../../../services/uploadRequests/uploadRequestMethods.js";
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

  return { success: true, uploadRequests: await uploadRequestList(req.user.userId, params.data.clientId) };
};

export default { config, handler };
