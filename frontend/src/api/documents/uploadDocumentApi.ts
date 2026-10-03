import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/upload"

export default defineRoute<Params, Response>({
  identifier : "documentUpload",
  apiPath : "/v1/documents/upload",
  sendCredentials : true
})
