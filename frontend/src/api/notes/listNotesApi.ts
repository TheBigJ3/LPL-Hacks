import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/notes/list"

export default defineRoute<Params, Response>({
  identifier : "noteList",
  apiPath : "/v1/notes/list",
  sendCredentials : true
})
