import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/clients/create.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/clients/create.js";
import { AppError } from "../../../modules/AppError.js";
import { clientCreate } from "../../../services/clients/clientMethods.js";
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

  const client = await clientCreate(req.user.userId, params.data);
  console.info(`[audit] ${req.user.userId} onboarded ${client.kind} client ${client.id} with ${client.members.length} members`);
  return { success: true, client };
};

export default { config, handler };
