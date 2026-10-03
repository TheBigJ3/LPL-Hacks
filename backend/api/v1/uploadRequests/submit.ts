import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/uploadRequests/submit.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/submit.js";
import { AppError } from "../../../modules/AppError.js";
import { uploadRequestSubmit } from "../../../services/uploadRequests/uploadRequestMethods.js";
import { UPLOAD_REQUEST_ERRORS } from "../../../types/native/uploadRequests/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 2,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.body);
  if (!params.success) throw new AppError(UPLOAD_REQUEST_ERRORS.REQUEST_NOT_FOUND);

  return { success: true, documentCount: await uploadRequestSubmit(params.data.token) };
};

export default { config, handler };
