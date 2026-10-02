# Rules
- `stores/` holds state that outlives a single component tree or must be shared between unrelated trees — the popup stack, the splash overlay, the socket connection, a multi-step upload flow. State used by one component and its children stays in that component's `.ts` hook (`useState`/`useReducer`), not here.
- One store per file, named `<thing>Store.ts` (`socketStore.ts`).
- Two shapes, pick based on what the state is:
  - **Layer store** (`socketStore.ts`): app infrastructure with its own lifecycle (init, async refresh, open/close). A private class (`SocketLayer`) holding state + a listener `Set`, exported as a single instance (`socketLayer`), exposing `getSnapshot`/`subscribe` and a `use...` hook built on `useSyncExternalStore`. Plain function exports (`socketOn(...)`, `socketAwait(...)`) wrap the instance for call sites.
  - **Zustand store** (`zustand/<thing>Store.ts`, e.g. a multi-file upload queue): user-driven form/flow data that several pages fill in over time. Lives under `stores/zustand/` (none exist yet), exported as a `use<Thing>Store` hook from `create(...)`.

# Specifics
- State is replaced, never mutated in place — each update produces a new object/array so snapshots compare correctly.
- Stores call the backend only through `features/apiLayer.ts` and `api/` definitions (per `api/agent.md`), and branch on `res.success` — never throw an expected failure out of a store.
- A store's state and option types live at the top of its own file unless another folder needs them, in which case they go in `types/native/<system>/` per `types/agent.md`.
- Components never write to a store's internals directly — only through the actions the store exports.

# Socket store (`socketStore.ts`)
The client side of the backend's Socket.IO system (`backend/sockets/agent.md`). A layer store: `socketLayer.init()` runs once in `components/template/App/App.tsx`, connects immediately (there is no auth — every connection is anonymous), and refetches every active query after a reconnect. Nothing else opens a socket or calls `io()`.

- **Listen** with `useSocketEvent(event, handler)` inside a component's `.ts` hook, where `event` is the shared event object (`import documentsExtracted from '@lpl-hacks/shared/src/types/native/sockets/documents/extracted.js'`) — its payload type comes with it; it subscribes for the component's lifetime and always calls the latest handler. Outside a hook (inside an effect that owns its own loop), use `socketOn(event, handler)`, which returns the unsubscribe — always call it in the cleanup.
- **Rooms are opt-in.** The server only sends room-scoped events (`household:{id}`, `document:{id}`) to sockets that joined, by emitting the matching client event (`households:watch`) — see `backend/sockets/agent.md`.
- **Events are signals.** A handler invalidates the react-query keys the event concerns (`queryClient.invalidateQueries({ queryKey: [someApi.identifier] })`) instead of copying the payload into state — REST stays the source of truth. The exception is live progress (e.g. extraction percentage), which is shown as-is.
- **Waiting for one outcome** (a Textract job settling) is `socketAwait(event, match, { timeoutMs, signal })`: it resolves with the first matching payload, or `null` on timeout or abort. Subscribe before making the request that could trigger it, and pair it with a REST check — the event can arrive before you subscribed or not at all.
- **Keep a fallback, not a loop.** Where a page would poll, it waits on the event and keeps a slow safety check (every few seconds while `useSocketStatus()` / `socketLayer.getSnapshot()` is `'connected'`, a fast interval only while it isn't). Never remove the REST path entirely.
- Event objects come from `@lpl-hacks/shared/src/types/native/sockets/<event path>.js` — never type an event name string or a payload shape here.
