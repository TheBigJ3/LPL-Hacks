import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/insight/ask"

export default defineRoute<Params, Response>({
  identifier : "insightAsk",
  apiPath : "/v1/insight/ask",
  sendCredentials : true
})
