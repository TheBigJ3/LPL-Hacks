import './.css'
import type { NoteSearch } from '../../.ts'

const NoteToolbar = ({ search, onCreate }: { search: NoteSearch; onCreate: () => void }) =>
  <form className="note-toolbar flex w-full items-center" role="search" onSubmit={search.submit}>
    <label data-onboarding="note-search" className="note-toolbar__search flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg">
      <span className="material-symbols-outlined note-toolbar__icon flex-none" aria-hidden="true">search</span>
      <input
        type="search"
        className="note-toolbar__input min-w-0 flex-1"
        placeholder="Search your notes"
        aria-label="Search your notes"
        value={search.draft}
        onChange={(event) => search.setDraft(event.target.value)}
        onBlur={search.blur}
      />
      {search.showClear &&
        <button type="button" className="note-toolbar__clear grid flex-none place-items-center rounded-md" aria-label="Clear search" onClick={search.clear}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>}
    </label>

    <button data-onboarding="note-create" type="button" className="note-toolbar__create flex h-11 flex-none items-center gap-3 rounded-lg px-3" onClick={onCreate}>
      New note
      <span className="material-symbols-outlined note-toolbar__icon" aria-hidden="true">add</span>
    </button>
  </form>

export default NoteToolbar
