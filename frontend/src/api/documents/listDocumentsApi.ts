import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/list"

export default defineRoute<Params, Response>({
  identifier : "documentList",
  apiPath : "/v1/documents/list",
  sendCredentials : true
})
