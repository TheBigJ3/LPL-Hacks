import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/delete"

export default defineRoute<Params, Response>({
  identifier : "insightDelete",
  apiPath : "/v1/insight/delete",
  sendCredentials : true
})
