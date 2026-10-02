---
inclusion: always
---

# agent.md cascade — mandatory reading before any edit

Project context (what Backbone is, the document pipeline, the non-negotiables) is in the root `agent.md` — read it first.

This repo's conventions live in `agent.md` files spread across the tree. Each one governs the
directory it sits in and everything below it. They are the authority on structure, naming, and style.

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
- Read the files with the read tool. Do not rely on memory, on summaries, or on another agent's report.
- Re-read the chain the first time you touch a given directory in a session. Steering does not
  substitute for it.
- Never assume what an `agent.md` says. If you have not read it, you do not know the convention.
- Touching files in several directories means reading several chains — one per directory.
- Discover the chain by listing `agent.md` files along the path; do not assume only the ones in
  these examples exist.
