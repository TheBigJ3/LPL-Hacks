import { useState } from 'react'
import type { DocumentSectionMode, DocumentSectionView } from '../../.ts'

const DOCUMENT_SECTION_LIST_ROWS = 3

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
