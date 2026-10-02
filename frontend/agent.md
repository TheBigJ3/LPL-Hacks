@.agents/ProgrammingStyle.md

Each folder under `src/` (`api/`, `components/`, `features/`, `hooks/`, `stores/`, `types/`) has its own `agent.md` with rules specific to that folder. Read it (per the root `agent.md` cascade) before reading or editing any file inside that folder.

**Status:** not built yet. Only the template's plumbing is here (`apiLayer`, `queryClient`, `stripe`, layer stores, generic hooks, template components). `components/template/App/App.tsx` and its `.ts` still reference removed template pages and auth — rewrite them when frontend work starts.

What the demo UI needs to show, per the root `agent.md` pipeline: uploading documents into a household, a review queue of low-confidence fields (confirm/correct → verified), each document's tags, and an assistant whose answers cite document + page and show verified/unverified per number.

Stack: React 19 + Vite, TypeScript, Tailwind v4 (plus per-component `.css`, per `components/agent.md`), react-router, @tanstack/react-query, zustand, axios (only through `features/apiLayer.ts`), react-toastify, motion.

# Where things go

The frontend mirrors the backend's layering — keep each concern in its layer:

| Backend        | Frontend                                         | Holds                                                          |
|----------------|--------------------------------------------------|----------------------------------------------------------------|
| `api/`         | `api/`                                           | route definitions only, one per backend route                  |
| `services/`    | a component's `.ts`, `features/`                 | the logic — display (`.tsx`) never contains it                  |
| `modules/`     | `features/`                                      | small reusable functions, one concern per file                 |
| `loaders/`     | `features/` (client singletons), `main.tsx`      | clients created once (`queryClient`, `stripePromise`)          |
| `types/`       | `types/`                                         | frontend-only types and error catalogs, per system             |
| —              | `hooks/`                                         | generic, system-agnostic React hooks                           |
| —              | `stores/`                                        | state that outlives any one component                          |

Per-system grouping is the same on both sides: a system named `documents` is `components/system/documents/`, `types/native/documents/`, `api/documents/`, `shared/src/types/native/documents/`, `backend/services/documents/`. Use the same system name everywhere; don't invent a new one for the frontend.

# Imports

Import through the path aliases, never through long relative chains (`../../../`). The aliases map one-to-one to the folders under `src/`:

| Alias           | Resolves to        |
|-----------------|--------------------|
| `@api/*`        | `src/api/*`        |
| `@assets/*`     | `src/assets/*`     |
| `@components/*` | `src/components/*` |
| `@features/*`   | `src/features/*`   |
| `@hooks/*`      | `src/hooks/*`      |
| `@stores/*`     | `src/stores/*`     |
| `@typings/*`    | `src/types/*`      |

When more than one alias could reach the target, pick the one that gets **closest** to it — the alias that leaves the shortest remaining path after it. Always prefer an alias over a relative path that climbs out of the current folder (`../`). A relative import is only acceptable for a file in the same folder or a direct child.

# main.tsx / index.css

- `main.tsx` is the composition root — mounts `<App />` onto `#root` and imports `index.css`. No providers, routes, or logic here; those belong in `components/template/App/`.
- `index.css` holds global concerns only: Tailwind import, `@theme` tokens (colors, fonts), `@font-face`, base resets. A style for one component never goes here — it goes in that component's `.css`.
- Colors and fonts come from the `@theme` tokens (`text-paragraph-off-white`, ...). Don't hard-code a hex that already exists as a token; if a new color is used in more than one component, add it as a token.
