import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/notes/create.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/notes/create.js";
import noteIndex from "../../../mq/jobs/notes/noteIndex.js";
import { AppError } from "../../../modules/AppError.js";
import { noteCreate } from "../../../services/notes/noteMethods.js";
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

  const { clientId, ...fields } = params.data;
  const note = await noteCreate(req.user.userId, clientId, fields);
  await noteIndex.producer({ noteId: note.id, requestedAt: Date.now() });
  return { success: true, note };
};

export default { config, handler };
