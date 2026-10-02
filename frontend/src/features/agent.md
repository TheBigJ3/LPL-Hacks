# Rules
- `features/` is the frontend's `modules/` + `loaders/` (see `backend/modules/agent.md`, `backend/loaders/agent.md`): small, general-purpose functions reused across more than one system, plus client singletons created once at import time. If something only makes sense for one component tree, it belongs in that component's `.ts`, not here.
- Flat, not organized by system — one file per concern, named for that concern in camelCase (`apiLayer.ts`, `queryClient.ts`, `indexedDbStorage.ts`).
- Keep each file single-purpose. If a file starts covering a second concern, split it.
- No JSX and no components. A function here takes plain arguments and returns a plain value (or a promise of one) — no reaching into a component's props or state, so it stays callable from any `.ts`, store, or hook.
- Dependencies flow one direction: `components/`, `stores/`, `hooks/` import from `features/`. A feature may import `api/` definitions, `types/`, shared types, and other features — never a component, and never a component's `.ts`.

# Specifics
- Client singletons (`queryClient`, `stripePromise`) are created once as a top-level export, same as a backend resource loader — import that export everywhere, never construct a second client inline.
- Env config is read with `import.meta.env.VITE_*` once at the top of the file that owns that integration, as a SNAKE_CASE const — don't scatter reads of the same env var across files.
- All HTTP goes through `apiLayer.ts` (`apiGetRequest`, `apiPostRequest`, `useApiGetQuery`) per `api/agent.md`. A third-party integration file (e.g. a future `pdfPreview.ts`) wraps its calls and returns our own shape, so callers never touch the vendor's raw response.
- Functions follow `{system}{Type}{Context}` naming from `ProgrammingStyle.md`, with the file's concern as the system (`indexedDbStorageGet`, `confidenceFormatPercent`).
