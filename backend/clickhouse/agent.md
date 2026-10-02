# Rules
- Optional for this project — ClickHouse only backs `metrics/`. Primary data (documents, fields, tags) lives in DynamoDB, not here.
- Every ClickHouse table change is a file in `migrations/`. Never create or alter tables from app code or at boot.
- Name files `NNNN_short_description.sql`, numbered in order: `0000_create_page_views.sql`.
- One SQL statement per file. ClickHouse runs one statement per request.
- Never edit or delete a migration that has run. Fix it with a new one.
- Run with `npm run ch:migrate`. It applies pending files in order and records each in the `_migrations` table.

# Tables
- Engine is `MergeTree`, except tables a MetricHouse metric ships to, which are `ReplacingMergeTree` with `id` last in `ORDER BY` (see `metrics/agent.md`). ClickHouse Cloud handles replication, so no `ON CLUSTER` and no `Replicated*` engines.
- `ORDER BY` is the table's index and can't be changed later. Lead with the columns queries filter on, end with the timestamp: `ORDER BY (household_id, created_at)`.
- Keep the timestamp ascending in `ORDER BY`. Newest-first queries (`ORDER BY created_at DESC LIMIT 50`) still use the index; ClickHouse reads it backwards.
- Partition time-based tables by month: `PARTITION BY toYYYYMM(created_at)`.
- Column names are snake_case, like Postgres.

# Inserts
- Analytics rows are recorded through a MetricHouse metric in `metrics/` and inserted by its sink — services don't insert them into ClickHouse directly.
- Anything else inserts through `clickhouse_client` from `loaders/clickhouseLoader.ts`, inside `services/<system>`. The client batches those on the server (`async_insert`), so insert rows as they happen; don't build your own buffer.
