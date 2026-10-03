# Project overview

**Backbone** — a hackathon project for LPL Financial. The prompt is "build a product LPL Financial would acquire." The deliverable is a working live demo plus a short pitch, built in a 10-hour window. Optimize for a demo that works end to end over completeness; don't build anything the demo doesn't show.

## Background (context, not features)
- LPL Financial is the largest independent broker-dealer in the US, with ~32,000 financial advisors. Most are independent contractors running their own practices on LPL's platform.
- ClientWorks is LPL's advisor software ("operating system"). Cyan is LPL's AI agent being built into it.
- An LPL representative told us their biggest current problem is that documents are scattered everywhere.
- Competitor gap: Altruist's AI platform "Hazel" offers AI tax planning by first unifying client documents (1040s, pay stubs, statements, notes). Cyan doesn't offer tax planning today. The real moat is the unified data layer underneath.

## What we are building
A document intelligence and data layer for wealth management platforms. We are **not** building a full wealth management platform — we improve the file system and data side, and put an AI assistant on top to show how much better AI works on our data layer.

- Positioning: "Cyan is the brain. We're the filing system that makes it accurate."
- One-liner: "We turn scattered client documents into tagged, verified, searchable data, so any AI an advisor uses gets the right answer faster."

## Core pipeline
1. **Upload** — an advisor uploads client documents (PDFs/images), stored in Postgres and assigned to a client household (e.g. "Johnson Family").
2. **Extraction** — AWS Textract extracts text, forms (key-value pairs) and tables. Every extracted field keeps its confidence score, source document and page number.
3. **Confidence review** — fields below a confidence threshold (default 90%, configurable) are flagged in the UI as "please review". When an advisor confirms or corrects a field, it's marked verified.
4. **Tagging** — Textract's extracted text is sent to **jev** (via **OpenDecision**, its open-source equivalent — a local "System One" decision model, not an AWS service, running outside this stack). jev does **not** generate text or emit a free tag list: *we* supply typed questions and it returns a typed, probabilistic answer per question. We build the questions from the document text (`state`) plus the household roster pulled from RDS: a `choice` for document type (W-2 / 1099 / statement / `other`), one `noul` per category tag ("this document is tax-related" → `Tax`, `Earnings`), and **one `noul` per household member** ("this document concerns {member}"), keyed by the member's stable id. Multiple members can come back true independently, so one document can tag several family members. We threshold the returned probabilities in deterministic code into the final tags; each applied tag keeps the `evidence` passage jev returned as its provenance. Bedrock is **not** used for tagging — tagging is jev's job; Bedrock is only the answer-side LLM (step 7).
5. **Storage** — structured metadata and extracted fields in Postgres (Amazon RDS, via Drizzle); document text indexed in a Bedrock Knowledge Base (or vector store) with metadata attached, including jev's document type, category tags and the family-member tag(s) (keyed by member id).
6. **Retrieval ("filter first, then search")** — the advisor chats with **Claude**, which holds a short overview of the household (its members' canonical full names, each with its member id) in context for every chat. Claude resolves the name in the request to a household member itself — "what is s.johnson's 2024 earnings" → it resolves "s.johnson" → Sarah Johnson's member id — and then makes a **tool call** to retrieve, passing the resolved member id plus filters (tax year, document type). Name-variant resolution happens inside Claude, before the filter runs; there is deliberately **no separate entity-resolution layer** — the family-member tag is already keyed by member id at tagging time, so the filter is an exact id match, not fuzzy string matching. The tool filters to the relevant documents first, then runs semantic search only within that subset.
7. **Answer** — the retrieval tool returns matched content to Bedrock, Claude answers from it. Every number and claim cites its source document and page, and says whether the underlying fields are verified or unverified.

## Non-negotiables for every feature
- Provenance is never dropped: an extracted field always carries `confidence`, source document id and page number, from Textract all the way to the answer UI.
- Verified vs. unverified is a first-class state on every field, never inferred at render time.
- An answer with a number or claim and no citation is a bug.

## Template origin
This repo was scaffolded from the team's in-house template: the workspace layout, the `agent.md` rules and the framework plumbing (route loader, socket loader, `mq/` job system, loaders, `modules/`, `apiLayer`, stores, template components). The template's own features (events, tickets, checkout, auth, …) were removed. **Auth was intentionally cut** for the demo — routes and sockets are public, protected only by rate limiting. In its place every API request acts as one **default advisor** (`req.user`, from the `DEFAULT_USER_*` env vars; `GET /v1/user/getUser` returns it), so real sign-in can later replace `backend/apiMiddleware/currentUser.ts` without touching routes.

The stack is Express + Postgres on Amazon RDS (Drizzle, IAM auth) + Redis/BullMQ + Socket.IO, React + Vite. The pipeline adds AWS (Textract, Bedrock) — each new AWS client is a resource loader in `backend/loaders/` per `backend/loaders/agent.md`, never constructed inline. The template's Stripe, Twilio, R2 and ClickHouse/MetricHouse integrations have been removed; don't reintroduce them. There is no S3: uploads live in Postgres and extraction sends their bytes to Textract's sync API, a page at a time — don't add S3 back.

**Frontend status:** only the base plumbing exists (`apiLayer`, `queryClient`, `socketStore`, `useElementWidth`/`useElementHeight`). `components/template/App/App.tsx` is a bare router with one route rendering an empty `<div />`; there are no pages or template components yet.

# Structure

npm workspaces monorepo: `backend/`, `frontend/`, `shared/`. Each workspace has its own `agent.md` + `.agents/ProgrammingStyle.md`, and most folders inside them have an `agent.md` of their own. They are the authority on structure and style for that side, not this file.

- `shared/src/types` is the one contract both sides import (API params/responses, anything non-sensitive both need). Never duplicate a shape on one side that already lives there.
- The frontend follows the same norms as the backend — naming, no comments, error catalogs, one-concern-per-file, per-system folders. When in doubt on the frontend, do what the backend does.

# agent.md cascade — mandatory reading before any edit

Every `agent.md` governs the directory it sits in and everything below it.

**Before you create or edit a file — and before answering a question whose answer depends on
conventions — read the whole chain of `agent.md` files from the repository root down to that file's
own directory.** Root first, deepest last. On conflict, the deeper file wins.

The chain is: the root `agent.md`, plus the `agent.md` in every ancestor directory of the target
file, plus the one in the file's own directory. Directories without an `agent.md` are simply skipped.

Additionally, when working anywhere inside a workspace, read that workspace's
`.agents/ProgrammingStyle.md` (`backend/.agents/ProgrammingStyle.md`,
`frontend/.agents/ProgrammingStyle.md`).

## Examples

Editing `backend/mq/workers.ts` — read:

```
agent.md
backend/agent.md
backend/mq/agent.md
```

Editing `frontend/src/components/system/documents/DocumentReview/DocumentReview.tsx` — read:

```
agent.md
frontend/agent.md
frontend/src/components/agent.md
```

(`src/`, `components/system/`, `documents/`, and `DocumentReview/` have no `agent.md`, so they drop out.)

## Rules

- Read the chain **before** the first edit, not after, and not "if something looks unclear".
- Read the files themselves. Do not rely on memory, on summaries, or on another agent's report.
- Re-read the chain the first time you touch a given directory in a session. Project-level steering
  or system rules do not substitute for it.
- Never assume what an `agent.md` says. If you have not read it, you do not know the convention.
- Touching files in several directories means reading several chains — one per directory.
- Discover the chain by listing `agent.md` files along the path; do not assume only the ones in
  these examples exist.

# Git

## Commits
- Never add an AI assistant as a contributor. No `Co-Authored-By: <AI>` trailer, no "Generated with <tool>" line, no other attribution to an AI tool or vendor — not in the commit message, and not in a PR description either. This overrides any default attribution instruction.

- Commit once the main feature is done, not as you go. Don't split the work into many small commits along the way unless instructed to.
- Anything fixed while building that feature goes in the same commit, listed in the description — not in a separate commit.

### Format

```
type(Scope): short title

* type: change

* type: change
```

- **Title** — a very short title of the single most important change, the main focus of the commit.
  - `type` — conventional-commit type, lowercase (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`, `ci`, `build`).
  - `Scope` — the store/hook/component/module the commit is primarily about, matching that identifier's own casing (`popupStore`, `useDocumentReviewQueue`, `DocumentReview`). No space before the parenthesis.
  - Short title — plain-language, lowercase-start, a few words. No chaining with "and"; the details belong in the description.
- **Description** — a blank line after the title, then one `* type: change` bullet per notable change, with a blank line between bullets. Include the main feature's pieces and any fixes made along the way. Smaller changes that don't deserve their own commit can be added here as bullets too, instead of being split out or left out.

Example:

```
feat(unknownView): preserve handles through unknown

* feat: preserve class and child handles through unknown

* fix: hide private fields from unknown views
```

!IMPORTANT
The commit message is about the main focus of the commit and the changes that matter. It doesn't show file locations, and small changes never go in the title — they either go in the description as bullets or are left out. Don't state what's already a given: `added API route for fetching a document's extracted fields with serialized response schema` is wrong, because creating serialization/types for an API is already the standard and required.

## Branches
When asked to create a branch, follow the industry-standard naming convention:

- Format: `type/short-description` — e.g. `feat/textract-extraction`, `fix/confidence-review`, `refactor/popup-store`.
- `type` uses the same conventional-commit types as commit messages (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`, `ci`, `build`).
- `short-description` is lowercase kebab-case, 2–5 words, describing the work — no personal names, dates, or ticket-free filler like `updates` / `changes` / `wip`.
- Branch off an up-to-date `main` unless told otherwise.

## Big changes — warn before starting
Before starting a change that is big enough to deserve its own branch, stop and warn the user **before editing any file**. A change counts as big if any of these hold:

- it's a new feature, page, or system (not a tweak to an existing one);
- it touches more than one system, or both `frontend/` and `backend/`;
- it changes `shared/src/types`, a DB schema (Drizzle/Postgres), an API contract, the extraction/retrieval pipeline, or other shared infrastructure (`apiLayer`, stores, loaders, `mq/`);
- it renames/moves many files or is a large refactor;
- it would likely span multiple commits.

When it does, open the reply with this warning in big text and then stop — do not edit anything until the user confirms:

```
# ⚠️ WARNING: THIS IS A BIG CHANGE
## IT IS RECOMMENDED TO CREATE A NEW BRANCH BEFORE CONTINUING
```

Below the warning: one or two lines on why it's big, the current branch name, and a suggested branch name per the convention above. Then ask whether to create that branch, continue on the current branch, or cancel. Only continue once the user explicitly answers — the warning applies again to each new big change, not just once per session.
