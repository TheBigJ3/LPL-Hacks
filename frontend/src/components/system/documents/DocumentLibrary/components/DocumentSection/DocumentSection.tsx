import './.css'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import type { DocumentSectionMode, DocumentSectionView } from '../../.ts'
import { DOCUMENT_CARD_VARIANTS, DOCUMENT_SECTION_VARIANTS, useDocumentSection } from './.ts'
import DocumentCard from './components/DocumentCard/DocumentCard'

type DocumentSectionProps = {
  section: DocumentSectionView
  mode: DocumentSectionMode
  columns: number
  wide: boolean
}

const DocumentSection = ({ section, mode, columns, wide }: DocumentSectionProps) => {
  const view = useDocumentSection(section, mode, columns)

  return <motion.section className="document-section flex flex-col" aria-label={section.title} variants={DOCUMENT_SECTION_VARIANTS}>
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <h2 className="document-section__title">{section.title}</h2>
        <div className="flex flex-none items-center gap-4">
          {view.seeAllHref &&
            <Link to={view.seeAllHref} className="document-section__see-all flex items-center gap-1 rounded-md">
              See all
              <span className="material-symbols-outlined document-section__see-all-icon" aria-hidden="true">arrow_forward</span>
            </Link>}
          <span className="document-section__count">{section.total}</span>
        </div>
      </div>
      <div className="document-section__divider" />
    </header>

    <ul className="document-section__grid grid" data-columns={columns} data-wide={wide}>
      {view.documents.map((document) =>
        <motion.li key={document.id} className="min-w-0" variants={DOCUMENT_CARD_VARIANTS}>
          <DocumentCard document={document} />
        </motion.li>
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
  </motion.section>
}

export default DocumentSection
