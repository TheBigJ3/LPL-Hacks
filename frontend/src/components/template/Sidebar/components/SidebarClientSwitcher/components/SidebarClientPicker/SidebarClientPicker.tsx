import './.css'
import type { KeyboardEvent } from 'react'
import type { SidebarClientOption } from '../../.ts'

type SidebarClientPickerProps = {
  query: string
  heading: string
  results: SidebarClientOption[]
  onQueryChange: (query: string) => void
  onSelect: (id: string) => void
  onEscape: (event: KeyboardEvent) => void
  onSearchKeyDown: (event: KeyboardEvent) => void
}

const SidebarClientPicker = ({ query, heading, results, onQueryChange, onSelect, onEscape, onSearchKeyDown }: SidebarClientPickerProps) =>
  <div className="sidebar-client-picker flex flex-col gap-2 pt-2" onKeyDown={onEscape}>
    <label className="sidebar-client-picker__search flex h-10 items-center gap-2 rounded-md px-3">
      <span className="material-symbols-outlined sidebar-client-picker__search-icon flex-none" aria-hidden="true">search</span>
      <input
        type="search"
        className="sidebar-client-picker__input min-w-0 flex-1"
        placeholder="Search clients or members"
        aria-label="Search clients or members"
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onSearchKeyDown}
      />
    </label>

    <h3 className="sidebar-client-picker__heading">{heading}</h3>

    {results.length
      ? <ul className="flex flex-col gap-0.5">
        {results.map((option) =>
          <li key={option.id}>
            <button
              type="button"
              className="sidebar-client-picker__option flex h-11 w-full items-center gap-3 rounded-md px-2"
              data-active={option.active}
              aria-current={option.active || undefined}
              onClick={() => onSelect(option.id)}
            >
              <span className="sidebar-client-picker__avatar grid flex-none place-items-center" data-kind={option.kind}>{option.initial}</span>
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="sidebar-client-picker__name truncate">{option.name}</span>
                <span className="sidebar-client-picker__detail truncate">{option.detail}</span>
              </span>
              {option.active && <span className="material-symbols-outlined sidebar-client-picker__check flex-none" aria-hidden="true">check</span>}
            </button>
          </li>
        )}
      </ul>
      : <p className="sidebar-client-picker__empty">No clients match that search</p>}
  </div>

export default SidebarClientPicker
