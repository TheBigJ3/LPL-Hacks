import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/documents/get.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/get.js";
import { AppError } from "../../../modules/AppError.js";
import { documentGet } from "../../../services/documents/documentMethods.js";
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

  return { success: true, ...(await documentGet(params.data.documentId)) };
};

export default { config, handler };
