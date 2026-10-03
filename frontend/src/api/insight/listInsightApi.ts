import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/list"

export default defineRoute<Params, Response>({
  identifier : "insightList",
  apiPath : "/v1/insight/list",
  sendCredentials : true
})
