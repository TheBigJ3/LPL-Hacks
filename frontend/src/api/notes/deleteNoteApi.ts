import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/notes/delete"

export default defineRoute<Params, Response>({
  identifier : "noteDelete",
  apiPath : "/v1/notes/delete",
  sendCredentials : true
})
