import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/notes/create"

export default defineRoute<Params, Response>({
  identifier : "noteCreate",
  apiPath : "/v1/notes/create",
  sendCredentials : true
})
