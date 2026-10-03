import './.css'

type ClientToolbarProps = {
  query: string
  onQueryChange: (query: string) => void
  onClear: () => void
  onAdd: () => void
}

const ClientToolbar = ({ query, onQueryChange, onClear, onAdd }: ClientToolbarProps) =>
  <div className="client-toolbar flex w-full items-center">
    <label className="client-toolbar__search flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg" role="search">
      <span className="material-symbols-outlined client-toolbar__icon flex-none" aria-hidden="true">search</span>
      <input
        type="search"
        className="client-toolbar__input min-w-0 flex-1"
        placeholder="Search clients or members"
        aria-label="Search clients or members"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {query &&
        <button type="button" className="client-toolbar__clear grid flex-none place-items-center rounded-md" aria-label="Clear search" onClick={onClear}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>}
    </label>

    <button type="button" className="client-toolbar__add flex h-11 flex-none items-center gap-2 rounded-lg px-3" onClick={onAdd}>
      <span className="material-symbols-outlined client-toolbar__add-icon" aria-hidden="true">person_add</span>
      <span className="client-toolbar__add-label">Add client</span>
    </button>
  </div>

export default ClientToolbar
