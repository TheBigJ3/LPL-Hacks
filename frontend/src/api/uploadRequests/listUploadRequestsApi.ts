import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/list"

export default defineRoute<Params, Response>({
  identifier : "uploadRequestList",
  apiPath : "/v1/uploadRequests/list",
  sendCredentials : true
})
