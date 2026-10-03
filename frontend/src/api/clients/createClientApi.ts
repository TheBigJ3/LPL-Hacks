import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/clients/create"

export default defineRoute<Params, Response>({
  identifier : "clientCreate",
  apiPath : "/v1/clients/create",
  sendCredentials : true
})
