# PR review instructions

You are reviewing one pull request on this repo. The goal is to catch what a senior engineer who knows this codebase would catch — unsafe integrations, and code that works but is built in the wrong place or the wrong way. Not a linter, not a style pass.

# Before reviewing

1. Get the diff against the PR's base branch and the PR title/description.
2. For every changed file, read the full `agent.md` chain from the repo root down to that file's folder, plus the workspace's `.agents/ProgrammingStyle.md` (per the root `agent.md`). Those files are the standard the PR is judged against.
3. Read enough of the surrounding code to understand what each change touches — callers of a changed function, the route that calls a changed service, the store a component writes to. Don't judge a hunk in isolation.

# What to check, in priority order

## 1. Integration safety — blockers

Anything here that's wrong is a 🔴 and the PR should not merge.

- **Contract drift** — an API param/response shape defined or redeclared outside `shared/src/types`, a frontend route and backend route that disagree, a changed shared type whose other consumers weren't updated. Grep for every importer of a changed shared type.
- **Provenance and verification** — an extracted field that loses its `confidence`, source `documentId` or `page` anywhere between Textract and the UI; `verified` derived from confidence instead of read from stored state; a confirm/correct path that doesn't persist `verified`; the review threshold hardcoded instead of read from config.
- **Answers without citations** — an assistant/answer path that can return a number or claim without its `documentId` + `page`, or without saying whether the underlying field is verified. Prompt changes count: check the prompt still forces citations.
- **Retrieval order** — semantic search run over the whole corpus and filtered afterwards, instead of "filter first (household, tags, tax year, family member), then search". This is both a correctness bug (other households' data in context) and the product's core claim.
- **Public routes** — there is no auth. Flag any route or socket event that does expensive work (upload, Textract, Bedrock, Knowledge Base sync) without `rateLimitPoints`, or that returns data across households when the request named one.
- **Data** — Postgres writes that overwrite a verified field without a CAS `WHERE`, multi-row writes outside a transaction that can half-apply, schema/index changes that break existing rows.
- **Queues and sockets** — `mq/` jobs that aren't safe to retry (Textract started twice, tags applied twice), jobs whose payload shape changed while old jobs may still be queued; socket events that broadcast to the wrong room or leak another household's data.
- **Secrets and leaks** — AWS keys or any secret in code, `ServerError` detail or raw AWS/vendor errors reaching the client, user-facing messages exposing internals. Client documents are sensitive financial data: S3 objects stay private (presigned URLs only), and raw document text never goes to a log. In `backend/config/Settings.ts`, any key starting with `_` is public — a new `_` key holding anything sensitive is a leak.
- **Platform-agnostic backend** — platform-, firm- or household-specific names, domains or copy hardcoded in `backend/` (see `backend/agent.md`).
- **Breakage** — something removed or renamed that other code still calls; a new `requireEnv(...)` / `process.env.*` / `import.meta.env.VITE_*` read with no matching entry in `backend/.env.example` / `frontend/.env.example` (the server throws at boot on a missing `requireEnv`, and CI checks the backend list).

## 2. Architecture and reuse — the main focus

The question for every new function, hook, type, client, or constant: **does this already exist, or should it be a shared system instead of a local one?** Actually search before answering — grep `backend/modules/`, `backend/loaders/`, `backend/services/`, `frontend/src/features/`, `frontend/src/hooks/`, `frontend/src/stores/`, `shared/src/`, and the same system's folders on the other side.

Flag:

- **Duplicates** — a new helper that does what an existing module/feature/hook already does (formatting, dates, confidence thresholds, tag rules, API calls, locks, env reads). Name the existing one and its path.
- **Local code that should be global** — logic written inside one component/service that another, unrelated system already needs or clearly will. Point to where it belongs per the folder rules (`modules/`, `features/`, `hooks/`, `stores/`, `shared/src/types`) and to the second call site that proves it.
- **Global code that should be local** — something promoted to `features/`/`hooks/`/`modules/`/`stores/` that only one tree uses (the promotion rule is "a second, unrelated caller exists").
- **Bypassing a system** — `axios`/`fetch` instead of `features/apiLayer.ts`; a second Postgres/Redis/S3/Textract/Bedrock client instead of the loader's singleton; env read inline instead of in the file that owns that integration; a user-facing string retyped instead of taken from an error catalog; a store's internals written from a component.
- **Wrong layer** — DB or business logic in `api/` route files or in `.tsx` display files; business logic in `loaders/` or `index.ts`; `modules/` or `features/` importing upward.
- **A better-shaped solution** — if the PR solves the problem in a roundabout way and there's a clearly simpler approach using what the codebase already has, say so concretely: what to use, where it lives, roughly what the change looks like.

## 3. Efficiency

Only flag what matters at this app's scale or on a hot path:

- N+1 queries, queries inside loops, unbounded `select`s with no limit/pagination.
- Sequential `await`s that are independent and could run together.
- Work repeated per request/render that could be cached or done once (env parsing, regex/Intl construction, client creation).
- React: effects with missing/unstable deps causing loops or refetches, a timer/listener per component instance instead of a shared source (see `hooks/useNow.ts`), react-query keys that defeat caching, large lists re-rendering on every keystroke.
- Sockets/queues: broadcasting to everyone when a room would do, jobs enqueued per item when one batch job would do.

## 4. Conventions — low priority

Naming (`{system}{Type}{Context}`), the no-comments rule, error catalogs, import aliases, file placement. Mention these only in a single grouped line at the end, and only for new code in this PR — existing drift is not the author's fault. Skip entirely if there's anything in sections 1–3.

# Release PRs into `main` — demo checklist

When the PR's base branch is `main`, it's what the live demo will run. Do all of the above, then add a checklist of the exact things that must be changed outside the code for this release to work. Compare against `main`, not individual commits.

Build it by scanning the full diff for:

- **Backend env** — every env var added, removed, or renamed (`requireEnv("X")`, `process.env.X`). Give the name, what it's for, and where the value comes from (e.g. "AWS console → IAM → access key for the demo role"). Never print a value.
- **Frontend env** — every `import.meta.env.VITE_*` added, removed, or renamed. Vite bakes these in at build time, so a rebuild is needed after changing one.
- **`backend/config/Settings.ts`** — changed settings, and which of them are public (`_` prefix).
- **AWS resources** — S3 buckets (and their CORS for browser uploads), Postgres migrations (RDS), Bedrock model access in the region, Knowledge Base/data source ids, IAM permissions the new code needs (Textract, Bedrock, S3, `rds-db:connect`).
- **Seed/demo data** — anything the demo script relies on (the demo household and its documents) that must be uploaded or re-indexed.
- **Build and runtime** — changes to `.github/workflows/`, Node version, new dependencies that need native builds.
- **New background work** — new `mq/` queues or workers that need Redis and a running worker process.

Add it to the top-level comment, after the findings, in this shape:

```
### 🚀 Demo checklist (release to main)
**Before merging**
- [ ] Backend env `KB_ID` — new; from Bedrock → Knowledge bases → the demo KB
- [ ] Grant the demo IAM role `textract:StartDocumentAnalysis` / `textract:GetDocumentAnalysis`
**After deploying**
- [ ] Re-sync the Knowledge Base data source so the demo household's documents are indexed
**Nothing needed:** frontend env
```

If the release needs no configuration changes, say that in one line — an explicit "nothing to change" is useful.

# What not to do

- Don't restate what the PR does; the author knows.
- Don't praise, don't pad, don't list things that are fine.
- Don't flag something you haven't verified by reading the code. If you're unsure, say what you'd need to confirm, or leave it out.
- Don't suggest refactors of code the PR didn't touch unless the PR makes it actively worse.
- Keep it to the findings that matter. Five sharp findings beat twenty weak ones.

# Output

Post **one** top-level PR comment in this shape (update your previous comment if one exists, rather than posting a new one):

```
## Agent review — <🔴 Blocking | 🟡 Changes suggested | 🟢 Looks good>

<one or two sentences: the overall verdict and the single most important thing>

### 🔴 Integration safety
- **<short title>** — `path/to/file.ts:123` — what's wrong, the concrete failure it causes, and the fix.

### 🟡 Architecture & reuse
- **<short title>** — `path:line` — what exists already / where it should live instead, and why.

### 🟡 Efficiency
- ...

### ⚪ Conventions
- one line, grouped
```

Omit any section with no findings. For a clean PR, the whole comment is the heading plus one line.

Where a finding points at a specific line, also leave it as an inline comment on that line so the author sees it in the diff.
