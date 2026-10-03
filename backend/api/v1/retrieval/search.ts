import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/retrieval/search.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/retrieval/search.js";
import { AppError } from "../../../modules/AppError.js";
import { retrievalChunkSearch } from "../../../services/retrieval/retrievalChunkMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 5,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const parsed = ParamsZod.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(GENERAL_ERRORS.BAD_REQUEST);
  }

  const { query, filters, limit } = parsed.data;
  const chunks = await retrievalChunkSearch(query, filters, limit);

  return { success: true, chunks };
};

export default { config, handler };
