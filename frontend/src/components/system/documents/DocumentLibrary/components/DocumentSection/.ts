import { useState } from 'react'
import type { Variants } from 'motion/react'
import type { DocumentSectionMode, DocumentSectionView } from '../../.ts'

const DOCUMENT_SECTION_LIST_ROWS = 3
const DOCUMENT_SECTION_EASE = [0.16, 1, 0.3, 1] as const

export const DOCUMENT_SECTION_VARIANTS: Variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0, transition: { duration: 0.32, ease: DOCUMENT_SECTION_EASE, staggerChildren: 0.03 } },
}

export const DOCUMENT_CARD_VARIANTS: Variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0, transition: { duration: 0.28, ease: DOCUMENT_SECTION_EASE } },
}

export function useDocumentSection(section: DocumentSectionView, mode: DocumentSectionMode, columns: number) {
  const [rows, setRows] = useState(DOCUMENT_SECTION_LIST_ROWS)

  const limit = mode === 'preview' ? columns : rows * columns
  const documents = section.documents.slice(0, limit)

  return {
    documents,
    seeAllHref: mode === 'preview' && section.total > columns ? section.seeAllHref : null,
    hasMore: mode === 'list' && section.total > limit,
    showCount: mode === 'preview',
    countLabel: section.total === 1 ? 'document' : 'documents',
    shownLabel: `Showing ${documents.length} of ${section.total}`,
    loadMore: () => setRows((current) => current + DOCUMENT_SECTION_LIST_ROWS),
  }
}
