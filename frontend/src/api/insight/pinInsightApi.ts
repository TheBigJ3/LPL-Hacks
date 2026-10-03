import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/pin"

export default defineRoute<Params, Response>({
  identifier : "insightPin",
  apiPath : "/v1/insight/pin",
  sendCredentials : true
})
