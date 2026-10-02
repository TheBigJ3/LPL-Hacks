@.agents/ProgrammingStyle.md

Each top-level folder (`api/`, `services/`, `mq/`, `sockets/`, `loaders/`, `modules/`, `types/`, `schemas/`, `tests/`) has its own `agent.md` with rules specific to that folder. Read it (per the root `agent.md` cascade) before reading or editing any file inside that folder.

# Platform-agnostic

Backbone is pitched as a data layer any wealth management platform (LPL's ClientWorks/Cyan first) could plug in, so the backend stays neutral:

- No hardcoded platform or client details: firm names, advisor/household names, logos, domains. Anything platform- or client-specific is read from env or stored data, never written into code. Demo data (e.g. the "Johnson Family" household) lives in seed data, not in services.
- User-facing text the backend sends (error catalog `MESSAGE`s, answer templates) stays brand-neutral, or pulls the brand name from config.

# index.ts

- `index.ts` is the composition root — the only place that creates the `Application`, attaches global middleware, boots loaders, and calls `.listen()`. It has no business logic, no route handlers, no DB queries: those belong to `api/`, `services/`, `loaders/` per their own rules.
- Env is loaded first (`import "dotenv/config"` at the top), before anything that might read `process.env`.
- Resource loaders (`postgresLoader.ts`, `redisLoader.ts`, ...) are brought in as plain imports for their side effect — importing the module is what instantiates the singleton (per `loaders/agent.md`). Import them before anything that depends on them being ready.
- Setup loaders (`routeLoader.ts`, `socketLoader.ts`, ...) are explicit async functions called here, in dependency order, because they need something index.ts creates (the `Application`, an `http.Server`) passed in — e.g. `await loadRoutes(app)` after the app and its global middleware exist, before `.listen()`.
- Global Express middleware — `cors`, `express.json()`, `cookie-parser`, any session middleware — is attached directly on `app` here, in the order that matters (session before anything that reads `req.session`, both before `loadRoutes`). This is app wiring, not a subsystem with its own file, so it doesn't need to be a loader itself.
- If session needs a backing store (e.g. Redis-backed), the store's client still comes from its resource loader (`redisLoader`'s export) — construct the store here using that import, don't instantiate a second Redis connection inline.
- Keep config values (allowed CORS origins, session options, port) as small local consts read from `process.env` right where they're used — if that config grows non-trivial (e.g. session store setup with error handling), that's a sign it belongs in its own loader instead of inline in `index.ts`.
- No local zod schemas or types beyond a trivial inline shape — if `index.ts` needs a type, it's importing one from `types/` or `shared/src/types`, not defining one.
