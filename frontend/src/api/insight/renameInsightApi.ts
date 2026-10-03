import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/rename"

export default defineRoute<Params, Response>({
  identifier : "insightRename",
  apiPath : "/v1/insight/rename",
  sendCredentials : true
})
