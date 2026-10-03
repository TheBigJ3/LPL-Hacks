import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/uploadRequests/submit"

export default defineRoute<Params, Response>({
  identifier : "uploadRequestSubmit",
  apiPath : "/v1/uploadRequests/submit",
  sendCredentials : true
})
