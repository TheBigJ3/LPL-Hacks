import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/notes/update.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/notes/update.js";
import noteIndex from "../../../mq/jobs/notes/noteIndex.js";
import { AppError } from "../../../modules/AppError.js";
import { noteUpdate } from "../../../services/notes/noteMethods.js";
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

  const { noteId, ...fields } = params.data;
  const note = await noteUpdate(req.user.userId, noteId, fields);
  await noteIndex.producer({ noteId, requestedAt: Date.now() });
  return { success: true, note };
};

export default { config, handler };
