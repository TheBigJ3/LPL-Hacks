import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/user/getUser.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "GET",
  rateLimitPoints: 1,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  return { success: true, userData: req.user };
};

export default { config, handler };
