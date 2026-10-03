import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/create"

export default defineRoute<Params, Response>({
  identifier : "uploadRequestCreate",
  apiPath : "/v1/uploadRequests/create",
  sendCredentials : true
})
