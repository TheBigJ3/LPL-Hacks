# Before editing

Before editing any file, check which folder under `src/` it lives in (`api/`, `components/`, `features/`, `hooks/`, `stores/`, `types/`) and follow that folder's `agent.md`. That file is the authority on structure and conventions specific to that folder — this file only covers what's common across all of them (errors, naming, comments, types). These are the same norms `backend/.agents/ProgrammingStyle.md` sets; the frontend doesn't get a looser version of them.

Existing code that predates these rules is not a precedent. When a nearby file breaks a rule here (a comment header, a function name in the wrong shape), write the new code by the rule anyway — don't copy the drift, and don't mass-rename untouched files unless asked.

# Errors

The frontend never shows a raw thrown error or an inline hard-coded message string to the user. Two kinds of failure, handled differently — the client-side mirror of the backend's `AppError`/`ServerError` split:

- **Expected failures** — a request that comes back `success: false`, invalid form input, a feature that isn't available. These are branches of normal flow: check `res.success` (per `api/agent.md`), branch on the result, and surface a message to the user (`toast.error(...)` or an inline field error). Never `throw` past them.
- **Unexpected failures** — something that can only mean a bug or a broken invariant (a required DOM node missing, a state that should be unreachable). `throw new Error(...)` — don't silently swallow it or paper over it with a fallback.
- The one place an expected failure is converted into a throw is a react-query `queryFn` (see `useApiGetQuery` in `features/apiLayer.ts`), because that's how react-query learns a query failed. Don't do it anywhere else.

## Error catalogs

Every user-facing failure message belongs to a catalog, same shape as the backend's: `types/native/<system>/errors.ts`, one `as const` object per system named `<SYSTEM>_ERRORS`, SNAKE_CASE keys, one entry per distinct failure:

```ts
export const DOCUMENT_UPLOAD_ERRORS = {
  HOUSEHOLD_REQUIRED: { STATUS: "INVALID_INPUT", MESSAGE: "Pick a household for this document" },
  FILE_TYPE_INVALID:  { STATUS: "INVALID_INPUT", MESSAGE: "Upload a PDF or an image" },
} as const

export type DocumentUploadErrorKey = keyof typeof DOCUMENT_UPLOAD_ERRORS
export type DocumentUploadError = (typeof DOCUMENT_UPLOAD_ERRORS)[DocumentUploadErrorKey]
```

- `STATUS` — the semantic string code. `MESSAGE` — the exact user-facing text. No `HTTP` field — nothing on the frontend responds with a status code.
- Reference the entry (`DOCUMENT_UPLOAD_ERRORS.HOUSEHOLD_REQUIRED.MESSAGE`), never retype the string at the call site. A message used exactly once and never branched on may stay inline, but anything that's validated, re-shown, or checked belongs in the catalog.
- When the message comes from the backend (`res.error?.message`), show that — don't re-catalog a message the backend already owns.

# Naming

- camelCase for variables and functions (`documentId`, `getDocument`).
- SNAKE_CASE (all caps) for constants and settings — env-derived config, error catalogs and their keys, fixed option lists, timing values (`BASE_URL`, `DOCUMENT_UPLOAD_ERRORS`, `REVIEW_CONFIDENCE_THRESHOLD`, `SPLASH_EXIT_MS`).
- PascalCase for components, types, and classes (`DocumentReview`, `ExtractedField`, `PopupLayer`). Types are PascalCase even when they're a union of strings — not `userAuthState`.
- A plain function name is `{system}{Type}{Context}` — the system it belongs to (matching its `components/system/<system>` / `types/native/<system>` folder), then what kind of action it is, then whatever narrows it down: `documentFormatUploadedAt`, `fieldGetConfidenceLabel`, `answerBuildCitations`. Same reason as the backend: the name is recognizable on its own in a stack trace or import list. Genuinely system-less utilities in `features/` use their concern as the system (`apiGetRequest`, `indexedDbStorageGet`).
- Hooks keep React's `use` prefix, then the same shape: `use{System}{Context}` (`useDocumentReviewQueue`, `useAnswerCitations`). Generic hooks in `hooks/` name what they give back (`useElementWidth`, `useNow`).
- Event handler props are `on{Event}` (`onChange`, `onClose`); the function passed to them is named for what it does, not `handle{Thing}`-guessing (`form.setName`, `form.openSummary`).

# Comments

No comments, by default. Naming and structure should carry the meaning on their own. This covers every form: `//`, `/* */`, `/** JSDoc */` headers, and JSX section markers like `{/* Left: main content */}` or `// --- Subscription`.

The one exception: a single line, and only when something genuinely isn't obvious from reading the code — a hidden constraint, a workaround for a specific browser/library bug, a timing value that must stay in sync with an animation elsewhere. Never a function or component header, never a description of what the code does, never more than one line. Same in `.css` files.

# Types

- A type used only inside one file stays inline in that file.
- A type used by a component and its own subcomponents lives in that component's `.ts` and is imported down.
- A type used across systems, or by `features/`/`stores/`/`hooks/`, goes in `src/types` (per `types/agent.md`).
- A type the backend also needs — anything describing API params/responses or a domain entity — goes in `shared/src/types`, never a frontend-local copy. If the shape already exists in shared, import it; don't redeclare a look-alike.
