import { defineRoute } from "@typings/native/routeTypes"
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/clients/list"

export default defineRoute<undefined, Response>({
  identifier : "clientList",
  apiPath : "/v1/clients/list",
  sendCredentials : true,
  queryConfig : { staleTime : 5 * 60 * 1000 }
})
