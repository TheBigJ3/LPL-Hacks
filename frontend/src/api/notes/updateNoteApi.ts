import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/notes/update"

export default defineRoute<Params, Response>({
  identifier : "noteUpdate",
  apiPath : "/v1/notes/update",
  sendCredentials : true
})
