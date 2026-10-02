# Rules
- Two top-level folders: `template/` and `system/`. Never put a component directly in `components/` itself — it belongs in one of the two.
- `template/` holds components used widely across the application — buttons, inputs, modals, anything with no knowledge of a specific feature. If a component reaches into one particular feature's data or only makes sense on one screen, it doesn't belong here.
- `system/` holds components scoped to one particular system/feature of the app (mirrors backend's own system/feature grouping — `services/<system>/`, `types/native/<system>/`). One folder per system, e.g. `system/documents/`, `system/assistant/`.
- Ensure that the ComponentName.tsx remains outside of a component folder to easily understand and see which tsx file is actually loading all this
- Every component — under `template/` or any depth under `system/` — follows the same recursive folder schema: 
  ```
  ComponentName/
    popup/
    components/          (only if it has subcomponents — see below)
      SubComponent/       (same schema, recursively)
    ComponentName.tsx
    .ts
    .css     (only if it needs the styling in the CSS rules below)
  ```
- The component file is named after its folder (`DocumentCard/DocumentCard.tsx`), not `index.tsx` — so editor tabs and import autocomplete show the component's actual name instead of a folder full of "index"s.
- A component only gets a `components/` subfolder once it actually has subcomponents that belong to it and nowhere else. Don't scaffold an empty `components/` folder in advance.
- A subcomponent lives under its parent's `components/` folder only as long as it's used exclusively by that parent. The moment a second component needs it, promote it — to the nearest shared ancestor's `components/` folder, or to `template/` if it's genuinely generic — rather than importing it out of another component's private folder.
- !IMPORTANT Don't nest a page that is its own system inside another system's folder just because the names are related. Each page/system gets its own folder at the same level:
  ```
  system/documents/              ✗ wrong
  system/documents/DocumentReview/   (a page that is its own system)

  system/documents/              ✓ right
  system/documentReview/
  ```

# Display vs. functionality
Same split as the backend's thin `api/` route + `services/` function: the `.tsx` is display, the `.ts` is everything else.

- `ComponentName.tsx` only renders. No function definitions, no `useState`/`useEffect` logic, no data shaping, no constants or option lists — it calls one hook from its `.ts` (`const section = useDocumentFieldsSection()`) and wires the result into JSX, the same way it imports `./.css`.
- `.ts` holds the component's hook (`use{System}{Context}`), its handlers, derived values, constants (SNAKE_CASE), and any types its subcomponents import. Inline arrow callbacks in JSX are fine only as one-line glue (`onClick={() => form.setOpen(true)}`) — anything with a branch or more than one statement is a named function in `.ts`.
- Reach for the backend only through `api/` + `features/apiLayer.ts` (per `api/agent.md`), and only from `.ts` — never from the `.tsx`.
- User-facing failure text comes from the system's error catalog (`types/native/<system>/errors.ts`, per `ProgrammingStyle.md`), not a string typed into the `.tsx`.
- No comments in `.tsx`, `.ts`, or `.css` — including JSX section markers like `{/* Header */}` and component header docblocks (per `ProgrammingStyle.md`). If a block of JSX needs a label to be understood, it's a subcomponent.

# CSS
- the .css file is exactly called .css and is put in each root of each component, and imported like import './.css'
- for each sub component avoid using the root .css instead create its own, since the root .css is already imported its better to create a new central css file
- Tailwind is the default for simple styling — background, font-weight, flex, positioning, spacing, and anything else expressible as a utility class. Reach for a `.css` file only for what Tailwind can't cleanly express: filters, gradients, and responsive values (see below).
- A component's `.css` file has one root class named after the component in kebab-case (`DocumentCard` → `.document-card`), matching the component's own root element. Class names are global (not CSS modules), so this kebab-case-of-the-component-name convention is what keeps them collision-free — never shorten or genericize the root class name.
- Responsive values (padding, gaps, sizes, anything that changes across breakpoints) are expressed as CSS custom properties scoped to the root class, prefixed with the same root class name, set at the base (mobile) level and overridden per breakpoint — the property declaration itself (`padding: var(--document-card-padding)`) is written once and never repeated inside a media query:
  ```css
  .document-card {
    --document-card-padding: 12px;
    padding: var(--document-card-padding);
  }

  @media (min-width: 670px) {
    .document-card {
      --document-card-padding: 23px;
    }
  }
  ```
- Breakpoints are chosen per-component, at whatever width that component's own layout needs to change — not from a shared fixed scale.
- When a component's layout depends on the measured size of some other element rather than the viewport (e.g. sizing `main-content` around a sidebar), don't reach for a media query — it can only see viewport size. Use the `useElementWidth` / `useElementHeight` hooks (`frontend/src/hooks/`) to measure the actual element, derive the boolean condition in the component, and pass it down as a `data-*` attribute — then branch on that attribute in CSS instead of a media query:
  ```tsx
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const wide = width > 760

  <div ref={ref} data-wide={wide}>
  ```
  ```css
  .document-card[data-wide="true"] {
    --document-card-padding: 23px;
  }
  ```
  The condition (`width > 760`) lives in the component, not the CSS — the CSS only ever sees the resulting `data-wide` attribute, same as it only ever sees a breakpoint in the media-query case above.
- The hooks' first return value is a callback ref, so `ref={ref}` only works when this component renders the element to measure itself. To measure an element it doesn't render — a shared layout node like `#root`, or some ancestor reached by selector — query it once and hand the node to the callback manually instead:
  ```tsx
  const [setRef, width] = useElementWidth<HTMLElement>()

  useEffect(() => {
    setRef(document.querySelector<HTMLElement>('#root'))
  }, [setRef])

  const wide = width > 760
  ```
  From here it's the same `data-wide` wiring as above — the component still only ever hands CSS a boolean-derived attribute, regardless of whether the measured node was its own ref or a queried one.
