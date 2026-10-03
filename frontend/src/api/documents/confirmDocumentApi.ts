import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/confirm"

export default defineRoute<Params, Response>({
  identifier : "documentConfirm",
  apiPath : "/v1/documents/confirm",
  sendCredentials : true
})
