# Rules
- A loader runs exactly once, at server startup — never on a request path, never lazily on first use.
- A loader's job is to stand up a resource (DB pool, cache client, connection) or wire up a subsystem (routes, sockets) that the rest of the app then depends on. It doesn't contain business logic.
- One resource/subsystem per file, named `<thing>Loader.ts` (`postgresLoader.ts`, `redisLoader.ts`, `routeLoader.ts`). AWS clients the pipeline adds follow the same rule — `textractLoader.ts`, `bedrockLoader.ts` — each exporting one client singleton, with region/credentials read from env at the top of that file.
- Read required config via env at the top of the file (fail fast if missing) — don't scatter env reads for the same resource across the codebase.

# Specifics
Two shapes, pick based on what the loader produces:

- **Resource loader** (`postgresLoader.ts`, `redisLoader.ts`): instantiates the client/pool as a top-level side effect of importing the file, and exports it as a singleton const for the rest of the app to import (`export const db = ...`). No init function to call — importing the module *is* the load. If another part of the app needs the same external resource but on isolated capacity (its own pool/connection so it can't starve the shared one), that's a separate loader file, not a parameter on the existing one — see `jobPostgresLoader.ts` next to `postgresLoader.ts`.
- **Setup loader** (`routeLoader.ts`, `socketLoader.ts`): exports an explicit async function (`loadRoutes(app)`) that `index.ts` calls once during boot to wire the subsystem up, because it needs something created earlier in startup (e.g. the `Application` instance) passed in — it can't just run at import time.

- Jobs are the one isolated capacity nobody imports by hand: `mq/workers.ts` runs every job inside `jobScope` (`modules/jobScope.ts`), and `postgresLoader`'s pool sends any query made in that scope to `job_postgres_pool` (`jobPostgresLoader.ts`, sized by `POSTGRES_JOB_POOL_MAX`). Services keep importing `db`; a backed-up queue still can't take the connections requests need.
- Loaders can import other loaders' exported singletons (a setup loader wiring routes may need the `db` from the resource loader), but nothing outside `loaders/` should construct these resources itself — always import the loader's export, never re-instantiate a client/pool inline elsewhere.
- Attach error handlers for the resource's own failure modes inside its loader (e.g. a pool's `'error'` event) — don't let that leak out as an unhandled crash.
