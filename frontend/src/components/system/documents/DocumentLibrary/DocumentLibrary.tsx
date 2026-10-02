import './.css'
import { AnimatePresence, motion } from 'motion/react'
import { DOCUMENT_LIBRARY_VIEW_VARIANTS, useDocumentLibrary } from './.ts'
import DocumentToolbar from './components/DocumentToolbar/DocumentToolbar'
import DocumentTagFilter from './components/DocumentTagFilter/DocumentTagFilter'
import DocumentSection from './components/DocumentSection/DocumentSection'
import DocumentEmptyState from './components/DocumentEmptyState/DocumentEmptyState'

const DocumentLibrary = () => {
  const { measureRef, ...library } = useDocumentLibrary()

  if (!library.clientSelected) return <div className="document-library flex flex-1 items-center justify-center">
    <h1 className="sr-only">Documents</h1>
    <DocumentEmptyState title="No client selected" subtitle="Select one to get started" />
  </div>

  return <div className="document-library flex flex-col items-center">
    <h1 className="sr-only">Documents</h1>
    <DocumentToolbar query={library.query} uploadHref={library.uploadHref} />
    <DocumentTagFilter options={library.tagOptions} />

    <div ref={measureRef} className="document-library__content w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={library.viewKey}
          className="document-library__sections flex flex-col"
          variants={DOCUMENT_LIBRARY_VIEW_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {library.sections.length
            ? library.sections.map((section) =>
              <DocumentSection key={section.key} section={section} mode={library.mode} columns={library.columns} wide={library.wide} />
            )
            : <DocumentEmptyState title={library.empty.title} subtitle={library.empty.subtitle} />}
        </motion.div>
      </AnimatePresence>
    </div>
  </div>
}

export default DocumentLibrary
