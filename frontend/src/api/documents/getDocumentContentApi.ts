import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/content"

export default defineRoute<Params, Response>({
  identifier : "documentContent",
  apiPath : "/v1/documents/content",
  sendCredentials : true
})
