# Rules
- Two top-level folders: `native/` for plain TS types/interfaces, `zod/` for Zod schemas. Never mix the two in one file.
- Naming: native exports are PascalCase (`User`), Zod exports are the same name suffixed with `Zod` (`UserZod`). This keeps both importable in the same file without collisions, e.g. `import { User } from "types/native/user"` + `import { UserZod } from "types/zod/user"`.
- Organize by feature/system, not by kind. Each feature gets its own folder under `native/` and a mirrored folder under `zod/`.
- If this data is non-sensitive and needed by both client and backend (e.g. API request/response shapes, route params), it does not belong here — put it in `shared/src/types` instead, following the same `native/` + `zod/` + feature-folder structure. Keep backend-only or sensitive types (DB-adjacent, internal service payloads) here in `backend/types`.

# Specifics
- A feature's primary type lives in that feature's `index.ts`:
  `types/native/user/index.ts` → `export type User = ...`
  `types/zod/user/index.ts` → `export const UserZod = z.object({...})`
- Secondary/related data for that feature gets its own file in the same folder, not stuffed into `index.ts`:
  `types/native/documents/documentPage.ts` → `export type DocumentPage = ...`
  `types/zod/documents/documentPage.ts` → `export const DocumentPageZod = z.object({...})`
- The `native/` and `zod/` trees should mirror each other 1:1 — same feature folders, same file names, so a type and its schema counterpart are always easy to find side by side.
- If a Zod schema's shape should also exist as a plain type, derive it instead of hand-writing a duplicate: `export type User = z.infer<typeof UserZod>` (place the derived type in the matching `native/` file).
