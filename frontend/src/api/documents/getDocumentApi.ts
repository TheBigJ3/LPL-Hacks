import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/get"

export default defineRoute<Params, Response>({
  identifier : "documentGet",
  apiPath : "/v1/documents/get",
  sendCredentials : true
})
