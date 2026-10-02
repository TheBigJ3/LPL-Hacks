# Rules
- `mq/` is the queue-side equivalent of `api/` + `services/`: it receives a job and dispatches it, but the actual work — and the CAS logic that makes it safe — lives in `services/<system>` (per `services/agent.md`), not here.
- **Every queue and every job is one file that declares itself.** There is no central list of names, queues, handlers or retry settings — `workers.ts` finds jobs by walking `mq/jobs/**`, the same way `routeLoader` walks `api/`. Adding a job is adding one file; adding a queue is adding one file. If a change makes you edit a second file just to register something, the change is wrong.
- **Queues** live at `mq/queues/<queue>.ts`, one per *operational profile* (concurrency, retries, retention) — not one per feature; many jobs share a queue. Default export is `defineQueue({ name, concurrency, jobOptions })`. The file owns everything about the queue, including the one-line reason its retry policy is what it is. The BullMQ `Queue` behind it opens lazily on first use, bound to the shared Redis client from `redisLoader`.
- **Jobs** live at `mq/jobs/<system>/<job>.ts`, one file per job, organized by system the same way as `services/<system>` and `types/<system>`. Default export is `defineJob({ name, queue, payload, jobId, handler })` (optionally `delay`), or `defineSchedule({ name, queue, schedule, handler })` for a repeating job. That definition *is* the job: its `producer` (what services call to enqueue it) and its `handler` (what the worker runs) both come out of it.
- `workers.ts` groups the discovered jobs by their queue and boots exactly one `Worker` per queue at that queue's concurrency, routing on `job.name`; an unregistered job name throws so it fails loudly. It refuses to boot if two job files declare the same name, or if jobs point at two different queue files that declare the same name. Schedules are upserted by the same boot, so a scheduled job needs nothing outside its own file either.

# Writing a job
Keep the file in this order: payload schema, its type, the handler, then the definition that references them.

```ts
const PayloadZod = z.object({
  documentId: z.string(),
});

type Payload = z.infer<typeof PayloadZod>;

const handler = async (payload: Payload) => {
  await documentExtractStart(payload.documentId);
};

export default defineJob({
  name: "documentExtract",
  queue: extraction,
  payload: PayloadZod,
  jobId: (payload) => `document-extract-${payload.documentId}`,
  handler,
});
```

- `name` is the job's stored identity — it's what Redis keeps for every queued, delayed and scheduled job. Never rename an existing one: jobs already waiting under the old name would find no handler. A new job's name follows `{system}{Type}{Context}` (`documentExtract`, `documentTag`).
- `payload` is validated by `defineJob` before `handler` runs, so the handler receives a typed, already-parsed payload — don't parse `job.data` again. A handler that needs the raw BullMQ job takes it as its second argument.
- `jobId` builds the deterministic id from the payload's business identity; `delay`, when present, returns milliseconds from now (clamped at zero).
- A handler that returns a string reports it as the job's outcome (BullMQ's return value).
- A job that re-enqueues itself references its own definition from inside the handler (`documentExtractPoll.producer(...)` re-enqueuing itself until Textract finishes), declared as a `const` and exported after.

# Specifics
- Every job must be safe to run at least twice — delivery is at-least-once, never exactly-once. Two layers make that true, and both are required:
  1. `jobId` is derived from the job's business identity (`document-extract-${documentId}`, never random), so an obvious duplicate enqueue collapses into the one already queued. This is cheap dedup, not the real guarantee.
  2. The real guarantee is the CAS inside the `services/` function the handler calls: every state-changing write is conditioned on the state it expects (`UPDATE ... SET status = 'Y' WHERE status = 'X'`) so a replayed or duplicate run finds 0 rows to touch and no-ops instead of double-applying. `handler` itself performs no unconditional writes — that logic belongs in `services/`, not `mq/`.
- A `handler` only orchestrates: call the matching `services/` function(s), enqueue follow-up jobs through their `producer`, return the outcome.
- Never call the next transition's function directly from a handler or a service — cross a phase boundary only by calling that next job's `producer`. This keeps every worker interchangeable: whichever node picks up the next job doesn't have to be the one that finished the last step.
- Persist before you enqueue: the CAS write commits (inside its own transaction) before the next job is scheduled. The queue is the execution layer, not the source of truth — Postgres is.
- Workers are started once, at boot, by `await startWorkers()` in `index.ts`'s composition root. Nothing in `mq/` self-starts; a queue definition opens its connection only when first used, so producers can be imported anywhere.
- `JobHandler`, `JobDefinition`, `QueueDefinition` and the rest of the shared shapes live in `types/native/mq` (per `types/agent.md`) — they're mq infrastructure, not redefined per job.
- Tests for a job mock its queue file (`vi.mock(".../mq/queues/extraction.js", ...)`) and assert on the queue's `add`, and call the definition's `producer`/`handler` directly.
