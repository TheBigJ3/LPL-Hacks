import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/uploadRequests/create.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/create.js";
import { AppError } from "../../../modules/AppError.js";
import { uploadRequestCreate } from "../../../services/uploadRequests/uploadRequestMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 2,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.body);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  const uploadRequest = await uploadRequestCreate({
    ...params.data,
    advisorId: req.user.userId,
    requestedBy: `${req.user.firstName} ${req.user.lastName}`,
  });
  return { success: true, uploadRequest };
};

export default { config, handler };
