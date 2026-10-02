# Rules
- `hooks/` holds generic React hooks with no knowledge of any one system — measuring an element, a shared clock, scroll locking. If a hook reads one system's data, drives one form, or only makes sense on one screen, it lives in that component's `.ts` (e.g. `useDocumentReviewQueue` in `DocumentReview/.ts`), not here.
- Flat. One hook per file, file named exactly after the hook (`useElementWidth.ts` exports `useElementWidth`).
- Promote a hook here only once a second, unrelated component tree needs it — same promotion rule as subcomponents in `components/agent.md`.

# Specifics
- Named export, never a default export.
- A hook returns plain values/callbacks, not JSX.
- If many instances would each start their own timer/listener/observer, share one module-level source through `useSyncExternalStore` that only runs while subscribed (see `useNow.ts`) instead of one per caller.
- Reading global state belongs to the store that owns it (`stores/agent.md`) — don't add a hook here that just re-exports a store's snapshot.
