import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/clients/list.js";
import { clientList } from "../../../services/clients/clientMethods.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "GET",
  rateLimitPoints: 1,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  return { success: true, clients: await clientList(req.user.userId) };
};

export default { config, handler };
