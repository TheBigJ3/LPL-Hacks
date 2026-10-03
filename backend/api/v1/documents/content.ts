import { pipeline } from "stream/promises";
import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/documents/content.js";
import type { RouteResponse } from "@lpl-hacks/shared/src/types/native/api/RouteResponse.js";
import { AppError } from "../../../modules/AppError.js";
import { documentGetContent } from "../../../services/documents/documentMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "GET",
  rateLimitPoints: 2,
};

// The body is the file itself, so the response goes out here instead of through the loader's JSON wrapper.
const handler: RouteHandler = async (req, res): Promise<RouteResponse> => {
  const params = ParamsZod.safeParse(req.query);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  const { contentType, body } = await documentGetContent(params.data.documentId);
  res.type(contentType);
  await pipeline(body, res);
  return { success: true };
};

export default { config, handler };
