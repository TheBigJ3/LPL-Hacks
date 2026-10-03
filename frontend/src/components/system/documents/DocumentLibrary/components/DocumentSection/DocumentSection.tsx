import './.css'
import { Link } from 'react-router'
import type { DocumentSectionMode, DocumentSectionView } from '../../.ts'
import { useDocumentSection } from './.ts'
import DocumentCard from './components/DocumentCard/DocumentCard'

type DocumentSectionProps = {
  section: DocumentSectionView
  mode: DocumentSectionMode
  columns: number
  wide: boolean
}

const DocumentSection = ({ section, mode, columns, wide }: DocumentSectionProps) => {
  const view = useDocumentSection(section, mode, columns)

  return <section className="document-section flex flex-col" aria-label={section.title}>
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="document-section__title">{section.title}</h2>
          {view.showCount &&
            <span className="document-section__count flex h-6 flex-none items-center">
              {section.total}
              <span className="sr-only"> {view.countLabel}</span>
            </span>}
        </div>
        {view.seeAllHref &&
          <Link to={view.seeAllHref} className="document-section__see-all flex flex-none items-center gap-1 rounded-md">
            See all
            <span className="material-symbols-outlined document-section__see-all-icon" aria-hidden="true">arrow_forward</span>
          </Link>}
      </div>
      <div className="document-section__divider" />
    </header>

    <ul className="document-section__grid grid" data-columns={columns} data-wide={wide}>
      {view.documents.map((document) =>
        <li key={document.id} className="min-w-0">
          <DocumentCard document={document} />
        </li>
      )}
    </ul>

    {view.hasMore &&
      <footer className="flex flex-col items-center gap-3">
        <p className="document-section__shown">{view.shownLabel}</p>
        <button type="button" className="document-section__load-more flex h-11 items-center gap-2 rounded-lg px-4" onClick={view.loadMore}>
          Load more
          <span className="material-symbols-outlined document-section__load-more-icon" aria-hidden="true">expand_more</span>
        </button>
      </footer>}
  </section>
}

export default DocumentSection
