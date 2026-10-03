import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/get"

export default defineRoute<Params, Response>({
  identifier : "insightGet",
  apiPath : "/v1/insight/get",
  sendCredentials : true
})
