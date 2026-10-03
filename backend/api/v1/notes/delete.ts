import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/notes/delete.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/notes/delete.js";
import noteIndex from "../../../mq/jobs/notes/noteIndex.js";
import { AppError } from "../../../modules/AppError.js";
import { noteDelete } from "../../../services/notes/noteMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 1,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.body);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  await noteDelete(req.user.userId, params.data.noteId);
  console.info(`[audit] ${req.user.userId} deleted note ${params.data.noteId}`);
  await noteIndex.producer({ noteId: params.data.noteId, requestedAt: Date.now() });
  return { success: true };
};

export default { config, handler };
