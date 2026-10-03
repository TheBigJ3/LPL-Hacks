import { defineRoute } from "@typings/native/routeTypes"
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/extraction/analyze"

export default defineRoute<undefined, Response>({
  identifier : "extractionAnalyze",
  apiPath : "/v1/extraction/analyze",
  sendCredentials : true
})
