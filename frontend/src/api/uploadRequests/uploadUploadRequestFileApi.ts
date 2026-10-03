import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/upload"

export default defineRoute<Params, Response>({
  identifier : "uploadRequestUpload",
  apiPath : "/v1/uploadRequests/upload",
  sendCredentials : true
})
