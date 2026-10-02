# Rules
- Folder structure mirrors the backend's `api/` tree — a file's path here matches the backend route it calls, one level of system grouping deep (`api/documents/uploadDocumentApi.ts`, `api/retrieval/askApi.ts`). This keeps a route findable on either side without needing to trace `apiPath` strings.
- One file = one route = one exported route definition, `export default defineRoute<Params, Response>({ ... })` from `types/native/routeTypes.ts`. Nothing else lives at the top level of the file — no request logic, no calling code.
- A route file never inlines its param or response shape. Both are imported from `@lpl-hacks/shared/src/types` — same contract the backend's `api/` folder types against (see its own `agent.md`), so the two sides can't drift out of sync:
  - `Response` (and `Params`, when the route takes any) is a native type at `shared/src/types/native/api/<same path>`.
  - If the route sends params, the matching `ParamsZod` schema lives at `shared/src/types/zod/api/<same path>` — mirrors the backend, which validates `req.body`/`params`/`query` against that exact schema. A route with no params (`defineRoute<undefined, Response>`) has nothing to add there.
- `defineRoute`'s generics are `<Params, Response>` — `Params` is `undefined` for a route that takes none. `identifier` is a short unique name for the route (also its react-query key), `apiPath` is the literal backend path it hits, `sendCredentials` controls whether cookies are sent. There is no `sendAuth` — auth was cut for the demo.
- Routes are called through `apiGetRequest` / `apiPostRequest` / `apiUploadRequest` / `useApiGetQuery` (`features/apiLayer.ts`) — never `axios` or `fetch` directly. Pass the route definition, then params matching its `Params` type:
  ```ts
  const res = await apiGetRequest(getDocumentApi, { documentId })
  if (!res.success) { /* res.error / res.httpStatus */ ; return }
  res.data // typed as Response
  ```
- `ApiResult` is a discriminated union on `success` (`true`/`false`) — always check `res.success` before touching `res.data`; a failed request only carries `error`/`httpStatus`/`headers`, not `data`. This is the client-side mirror of the backend's `AppError`/`ServerError` split: a `success: false` with a `code`/`message` is an expected failure to branch on, not something to throw past.

# Examples

Illustrative only — `documents/` doesn't exist yet, shown to demonstrate the full wiring end to end.

## GET, with a path param and a query param

`shared/src/types/zod/api/v1/documents/get.ts` — only params get a zod schema, it's the one crossing the trust boundary:
```ts
import { z } from "zod";

export const ParamsZod = z.object({
  documentId: z.string(),
  includeFields: z.boolean().optional(),
})
```

`shared/src/types/native/api/v1/documents/get.ts` — `Params` inferred from its zod counterpart, `Response` plain since it's our own output:
```ts
import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/documents/get.js";

export type Params = z.infer<typeof ParamsZod>

export type Response = {
  documentId: string;
  householdId: string;
  tags: string[];
  status: "uploaded" | "extracting" | "needsReview" | "ready";
}
```

`api/documents/getDocumentApi.ts` — `documentId` fills the `:documentId` path segment, whatever's left (`includeFields`) is sent as the query string:
```ts
import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/get"

export default defineRoute<Params, Response>({
  identifier : "getDocument",
  apiPath : "/v1/documents/:documentId",
  sendCredentials : true
})
```

Call site:
```ts
const res = await apiGetRequest(getDocumentApi, { documentId, includeFields: true })
if (!res.success) return

res.data.status // typed as Response
```

## POST, with body params

`shared/src/types/zod/api/v1/extraction/verifyField.ts`:
```ts
import { z } from "zod";

export const ParamsZod = z.object({
  fieldId: z.string(),
  correctedValue: z.string().optional(),
})
```

`shared/src/types/native/api/v1/extraction/verifyField.ts`:
```ts
import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/extraction/verifyField.js";

export type Params = z.infer<typeof ParamsZod>

export type Response = {
  fieldId: string;
  value: string;
  verified: true;
}
```

`api/extraction/verifyFieldApi.ts` — no `:name` segments in `apiPath`, so every param goes in the JSON body:
```ts
import { defineRoute } from "@typings/native/routeTypes"
import type { Params, Response } from "@lpl-hacks/shared/src/types/native/api/v1/extraction/verifyField"

export default defineRoute<Params, Response>({
  identifier : "verifyField",
  apiPath : "/v1/extraction/verifyField",
  sendCredentials : true
})
```

Call site:
```ts
const res = await apiPostRequest(verifyFieldApi, { fieldId, correctedValue })
if (!res.success) return

res.data.verified // typed as Response
```
