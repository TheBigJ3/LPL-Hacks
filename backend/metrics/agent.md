# Rules
- Optional for this project: no metrics are declared yet, and nothing in the demo needs ClickHouse. Only add one if the pitch shows it (e.g. extraction confidence over time).
- `metrics/` holds [MetricHouse](https://metrichouse.dev) metric declarations and their sinks — nothing else. No business logic, no queries, no request handling.
- One file per system, named for it (`metrics/extraction.ts`, `metrics/retrieval.ts`), matching the `services/<system>` folder that records into it. Every metric in it is exported, and `metrics/index.ts` re-exports every file — that module is the schema `loaders/metricHouseLoader.ts` registers, so a metric missing from it is never flushed.
- `sinks.ts` holds the shared write functions. A metric ships through `metricsSinkClickHouse("<table>")`; don't write a one-off sink inline in a declaration.
- The house (`metric_house`) is built once in `loaders/metricHouseLoader.ts` on the shared `redis_client`, started in `index.ts` after `listen`, and stopped on `SIGTERM`/`SIGINT`. Nothing else creates a house or a driver.

# Declaring
- Metric names are snake_case and equal to the ClickHouse table they ship to: `event("extraction_runs", { ..., write: metricsSinkClickHouse("extraction_runs") })`.
- Pick the type by the question it answers — `counter` for tallies, `gauge` for sampled values, `level` for a value that moves up and down, `timer` for durations, `event` for whole records with ids and detail, `log` for app messages. Pick per metric; there is no central list.
- `dims` are for small, fixed sets only — `oneOf([...])`, `bool()`, route patterns. Anything a client can influence or that grows without bound (document/household ids, UTM values, free text, URLs) is an `event` field, never a dim, because every distinct value is a new series held in Redis.
- Leave `flush` to the house default (`1m`) unless a metric has a reason to ship on its own cadence.

# Recording
- Record from `services/<system>`, like every other side effect. `record()`/`add()` return before anything is persisted, so they never slow the caller.
- `record()` and `add()` **throw synchronously** on an unknown field, a missing required one, or a wrong type. Build the fields from values already validated/normalized upstream, so a metric can never fail the request it's measuring.
- MetricHouse delivers at least once: a row is never dropped because a write failed, but it can arrive twice, and one recorded right before a crash can be lost. Money, credit and payouts are decided from Postgres; metrics are for trends and dashboards.

# Tables
- Every metric's table is a migration in `clickhouse/migrations/` per `clickhouse/agent.md`, shaped from `metric.rowShape()`: an event row is `id`, `ts`, its fields, `_ingested_at`; a counter row is `id`, `bucket_ts`, its dims, `value`.
- Engine is `ReplacingMergeTree`, with `id` as the last `ORDER BY` column, so a resent row collapses into the original. Queries that must be exact use `FINAL`.
