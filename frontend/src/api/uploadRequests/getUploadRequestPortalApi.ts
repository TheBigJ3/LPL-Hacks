import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/portal"

export default defineRoute<Params, Response>({
  identifier : "uploadRequestPortal",
  apiPath : "/v1/uploadRequests/portal",
  sendCredentials : true
})
