# Before editing

Before editing any file, check which top-level folder it lives in (`api/`, `services/`, `mq/`, `sockets/`, `loaders/`, `modules/`, `types/`, `schemas/`, `clickhouse/`, `metrics/`, `tests/`) and follow that folder's `agent.md`. That file is the authority on structure and conventions specific to that folder — this file only covers what's common across all of them (errors, naming, comments).

# Errors

Two error classes, both extend `Error`, both thrown from `api/`/`services/`/`mq/`/`sockets/` per their own folder rules — but they mean different things and the shared error handler treats them differently.

- `AppError` is for outcomes a caller can expect to sometimes hit — bad input, not found, a conflict, a feature that's turned off, anything that's just the unhappy branch of normal business logic (`documentGet` failing because the id doesn't resolve, `extractedFieldVerify` failing because the field was already verified). **Never logged** — it's not a bug, so logging it would be noise.
- `ServerError` is for things that weren't supposed to happen — an invariant broken, an upstream call failing in a way nothing was built to handle, a bug. **Always logged.** Its first constructor arg is an optional user-facing message for the rare case it does escape to a client; leave it out and a generic message is shown instead so no internal detail leaks. The second arg is the real detail, and that's what gets logged (`new ServerError(undefined, "[env] Environment variable X not found!")`).
- Rule of thumb: if you can name it as a case the caller should handle and it'll happen again under normal use, it's an `AppError`. If it can only mean something already went wrong, it's a `ServerError`.
- Construct `AppError` from a catalog entry (below) whenever the error is one a service or route could plausibly hit more than once: `throw new AppError(ACCOUNT_MANAGER_ERRORS.ACCOUNT_NOT_FOUND)`. Reserve the `(message, statusCode, code)` form for a genuine one-off not worth cataloging.

## Error catalogs

Every service gets its own error catalog at `types/native/<system>/errors.ts` (same per-feature folder `types/agent.md` already uses) — one `as const` object per system, named `<SYSTEM>_ERRORS`, one entry per distinct failure:

```ts
export const ACCOUNT_MANAGER_ERRORS = {
    EMAIL_ALREADY_EXISTS:  { STATUS: "CONFLICT",            HTTP: 409, MESSAGE: "Email already exists"},
    ACCOUNT_NOT_FOUND:     { STATUS: "NOT_FOUND",           HTTP: 404, MESSAGE: "Account not found"},
    ACCOUNT_DELETE_FAILED: { STATUS: "SERVICE_UNAVAILABLE", HTTP: 503, MESSAGE: "Unable to delete account, try again later"},
    INVALID_CREDENTIALS:   { STATUS: "UNAUTHORIZED",        HTTP: 401, MESSAGE: "Invalid email or password"},
} as const;
```

- `STATUS` — the semantic string code the response carries.
- `HTTP` — the status `AppError` throws with.
- `MESSAGE` — the exact user-facing text.

Errors that don't belong to one system — genuinely cross-cutting ones — go in `types/native/generalErrors.ts` instead, same catalog shape, just not scoped to a feature folder (same treatment `schemas/agent.md` gives a repeated column type in `general.ts`).

# Naming

- pascalCase for variables and functions (`accountId`, `getUser`) — same convention `schemas/agent.md` uses for column keys.
- SNAKE_CASE (all caps) for constants and settings — env-derived config, error catalogs and their keys, registry values (`CORS_ALLOWED_ORIGINS`, `ACCOUNT_MANAGER_ERRORS`, `EMAIL_ALREADY_EXISTS`).
- A function name is `{system}{Type}{Context}` — the system it belongs to (matching its `services/<system>` folder per `services/agent.md`), then what kind of action it is, then whatever narrows it down: `documentGetData`, `documentCreate`, `extractedFieldVerify`. This keeps the function's name recognizable on its own — in a stack trace, an import list, a log line — without needing its file path alongside it to know what it touches.

# Comments

No comments, by default. Naming and structure should carry the meaning on their own.

The one exception: a single line, and only when something genuinely isn't obvious from reading the code — a hidden constraint, a workaround for a specific bug, the reason a check exists that isn't inferable from the check itself. Never a function header, never a description of what the function does, never more than one line.
