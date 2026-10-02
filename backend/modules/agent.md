# Rules
- `modules/` holds small, general-purpose functions and classes reused across the whole backend — not tied to any one feature. If something only makes sense for one system, it belongs in that system's `services/` or `mq/` folder (per `services/agent.md`/`mq/agent.md`), not here.
- Flat, not organized by feature — one file per utility, named for what it exports (`AppError.ts`, `requireEnv.ts`, `asyncHandler.ts`). Unlike `services/`, `mq/`, and `types/`, there's no per-system folder layer, because these aren't feature code.
- Dependencies only flow one direction: `api/`, `services/`, `mq/`, `loaders/` all import from `modules/` — `modules/` never imports from any of them. A module may depend on `types/` and on other modules, and that's it.
- Keep each file single-purpose: one exported function or one small class per file (`AppError`, `requireEnv`). If a file starts covering more than one concern, split it.
- A module is pure/side-effect-light on import — plain function and class definitions, at most simple constant setup. Anything that needs to establish a live resource at boot (a DB pool, a Redis client) is a loader (`loaders/agent.md`), not a module — that's the line between the two folders.

# Specifics
- `AppError` (the error class every other rule file — `api/agent.md`, `services/agent.md`, `mq/agent.md` — assumes exists and throws for domain failures) lives here. Add sibling error types here too if a distinct class is genuinely needed, rather than overloading `AppError` with cases it wasn't meant for.
- Env/config readers (`requireEnv`, a settings loader) live here, fail fast — throw — when a required value is missing or malformed, and cache what they load instead of re-reading/re-parsing on every call.
- Utilities that translate a low-level error into something the app can act on (e.g. unwrapping a driver-specific DB error to read its Postgres error code) belong here — anywhere that needs that translation imports it instead of re-deriving it inline.
- No local zod schemas or types beyond a trivial inline shape a single utility needs for its own signature. A shape used by more than one module, or by callers outside `modules/`, goes in `types/` per `types/agent.md` — not defined here and re-imported.
- A module never reaches into `req`/`res`, a job, or a system's DB rows directly — it takes plain arguments and returns a plain value/throws, so it stays callable from a route, a service, or a job processor without adaptation (same signature discipline as `services/agent.md`).
