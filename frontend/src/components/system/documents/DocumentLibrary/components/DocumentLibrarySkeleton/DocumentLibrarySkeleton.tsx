import './.css'
import { useDocumentLibrarySkeleton } from './.ts'

type DocumentLibrarySkeletonProps = {
  columns: number
  wide: boolean
}

const DocumentLibrarySkeleton = ({ columns, wide }: DocumentLibrarySkeletonProps) => {
  const skeleton = useDocumentLibrarySkeleton(columns)

  return <div className="document-library-skeleton flex flex-col" role="status">
    <span className="sr-only">Loading documents</span>
    <span className="document-library-skeleton__bone document-library-skeleton__summary" aria-hidden="true" />
    <div className="document-library-skeleton__sections flex flex-col" aria-hidden="true">
      {skeleton.sections.map((section) =>
        <div key={section.key} className="document-library-skeleton__section flex flex-col">
          <div className="flex flex-col gap-3">
            <div className="flex h-6 items-center gap-3">
              <span className="document-library-skeleton__bone document-library-skeleton__title" style={{ width: section.titleWidth }} />
              <span className="document-library-skeleton__bone document-library-skeleton__count" />
            </div>
            <span className="document-library-skeleton__divider" />
          </div>
          <div className="document-library-skeleton__grid grid" data-columns={columns} data-wide={wide}>
            {skeleton.cards.map((card) =>
              <div key={card} className="flex min-w-0 flex-col gap-6">
                <span className="document-library-skeleton__bone document-library-skeleton__page" />
                <span className="flex flex-col gap-3">
                  <span className="document-library-skeleton__bone document-library-skeleton__name" />
                  <span className="document-library-skeleton__bone document-library-skeleton__date" />
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
}

export default DocumentLibrarySkeleton
