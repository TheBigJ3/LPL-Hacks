import './.css'
import OnboardingTour from '@components/template/OnboardingTour/OnboardingTour'
import { AnimatePresence, motion } from 'motion/react'
import { DOCUMENT_LIBRARY_TOUR_STEPS, DOCUMENT_LIBRARY_TOUR_STORAGE_KEY, DOCUMENT_LIBRARY_VIEW_VARIANTS, useDocumentLibrary } from './.ts'
import DocumentToolbar from './components/DocumentToolbar/DocumentToolbar'
import DocumentSection from './components/DocumentSection/DocumentSection'
import DocumentLibrarySkeleton from './components/DocumentLibrarySkeleton/DocumentLibrarySkeleton'
import PageHeader from '@components/template/PageHeader/PageHeader'
import EmptyState from '@components/template/EmptyState/EmptyState'

const DocumentLibrary = () => {
  const { measureRef, ...library } = useDocumentLibrary()

  if (!library.clientSelected) return <>
    <PageHeader title="Documents" />
    <div className="document-library flex flex-1 items-center justify-center">
      <h1 className="sr-only">Documents</h1>
      <EmptyState title="No client selected" subtitle="Select one to get started" icon="draft" />
    </div>
  </>

  return <>
    <PageHeader title="Documents">
      <DocumentToolbar query={library.query} uploadHref={library.uploadHref} tagOptions={library.tagOptions} />
    </PageHeader>
    <div className="document-library flex flex-col items-center">
      <h1 className="sr-only">Documents</h1>

      <div data-onboarding="document-list" ref={measureRef} className="document-library__content w-full" aria-busy={library.loading}>
        <AnimatePresence mode="wait" initial={false}>
          {library.loading
            ? <motion.div key="skeleton" variants={DOCUMENT_LIBRARY_VIEW_VARIANTS} initial="enter" animate="center" exit="exit">
              <DocumentLibrarySkeleton columns={library.columns} wide={library.wide} />
            </motion.div>
            : <motion.div
              key={library.viewKey}
              className="document-library__view flex flex-col"
              variants={DOCUMENT_LIBRARY_VIEW_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {library.summary && <p className="document-library__summary" aria-live="polite">{library.summary}</p>}
              {library.sections.length
                ? <div className="document-library__sections flex flex-col">
                  {library.sections.map((section) =>
                    <DocumentSection key={section.key} section={section} mode={library.mode} columns={library.columns} wide={library.wide} />
                  )}
                </div>
                : <EmptyState title={library.empty.title} subtitle={library.empty.subtitle} icon="draft" />}
            </motion.div>}
        </AnimatePresence>
      </div>
    </div>
    <OnboardingTour steps={DOCUMENT_LIBRARY_TOUR_STEPS} storageKey={DOCUMENT_LIBRARY_TOUR_STORAGE_KEY} />
  </>
}

export default DocumentLibrary
