# Rules
- Same layout as `backend/types/agent.md`: `native/` for plain TS types, `zod/` for Zod schemas (only if the frontend needs its own runtime validation). Never mix the two in one file.
- Naming: native exports are PascalCase (`ReviewQueueItem`), Zod exports are the same name suffixed with `Zod` (`ReviewQueueItemZod`).
- Organize by system, not by kind — one folder per system under `native/` (and mirrored under `zod/` if it has schemas), using the same system name as `components/system/<system>`.
- Only frontend-only types live here: view models, UI option shapes, route handles, error catalogs. Anything the backend also needs — API params/responses, domain entities — goes in `shared/src/types`, following that folder's `native/` + `zod/` + system structure. Never keep a frontend copy of a shape that exists in shared.

# Specifics
- A system's primary type lives in that system folder's `index.ts`; secondary types get their own file in the same folder (`types/native/documents/index.ts`, `types/native/documents/reviewQueueItem.ts`) — not stuffed into one file.
- Each system's error catalog is `types/native/<system>/errors.ts`, shaped per `ProgrammingStyle.md`.
- If a Zod schema's shape should also exist as a plain type, derive it (`z.infer<typeof XZod>`) instead of hand-writing a duplicate.
- A type used only inside one component tree stays in that component's `.ts`; it comes here only once a store, feature, hook, or second system needs it.
- `routeTypes.ts` (`defineRoute` and friends) is shared `api/` infrastructure, the same way `JobHandler` is shared `mq/` infrastructure on the backend — it stays flat at `native/`, not in a system folder.
