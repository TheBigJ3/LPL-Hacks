import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/revoke"

export default defineRoute<Params, Response>({
  identifier : "uploadRequestRevoke",
  apiPath : "/v1/uploadRequests/revoke",
  sendCredentials : true
})
