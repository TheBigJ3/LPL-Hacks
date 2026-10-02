import './.css'
import { Link } from 'react-router'
import { useDocumentToolbar } from './.ts'

const DocumentToolbar = ({ query, uploadHref }: { query: string; uploadHref: string }) => {
  const toolbar = useDocumentToolbar(query)

  return <form className="document-toolbar flex w-full items-center justify-center" role="search" onSubmit={toolbar.submit}>
    <div className="document-toolbar__search flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg">
      <label className="flex min-w-0 flex-1 items-center gap-3">
        <span className="material-symbols-outlined document-toolbar__search-icon flex-none" aria-hidden="true">search</span>
        <input
          type="search"
          className="document-toolbar__input min-w-0 flex-1"
          placeholder="Search your documents"
          aria-label="Search your documents"
          value={toolbar.draft}
          onChange={(event) => toolbar.setDraft(event.target.value)}
        />
      </label>
      {toolbar.showClear
        ? <button type="button" className="document-toolbar__action grid flex-none place-items-center rounded-md" aria-label="Clear search" onClick={toolbar.clear}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
        : <button type="submit" className="document-toolbar__action grid flex-none place-items-center rounded-md" aria-label="Search">
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>}
    </div>

    <Link to={uploadHref} className="document-toolbar__upload flex h-11 flex-none items-center gap-3 rounded-lg px-3">
      Upload
      <span className="material-symbols-outlined document-toolbar__upload-icon" aria-hidden="true">upload</span>
    </Link>
  </form>
}

export default DocumentToolbar
