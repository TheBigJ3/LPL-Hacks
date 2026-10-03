import './.css'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { DOCUMENT_TAG_FILTER_MENU_VARIANTS, useDocumentTagFilter } from './.ts'
import DocumentTagFilterLabel from './components/DocumentTagFilterLabel/DocumentTagFilterLabel'
import type { DocumentTagOption } from '../../.ts'

const DocumentTagFilter = ({ options }: { options: DocumentTagOption[] }) => {
  const { rootRef, buttonRef, ...filter } = useDocumentTagFilter(options)

  return <div data-onboarding="document-tags" ref={rootRef} className="document-tag-filter relative flex flex-none items-center rounded-md" data-active={!!filter.selected} onKeyDown={filter.closeOnEscape}>
    <button
      ref={buttonRef}
      type="button"
      className="document-tag-filter__button flex h-8 items-center gap-1 rounded-md px-2"
      data-active={!!filter.selected}
      aria-haspopup="true"
      aria-expanded={filter.open}
      aria-label={filter.selected ? `Filter by tag: ${filter.selected.label}` : 'Filter by tag'}
      onClick={filter.toggle}
    >
      <span className="material-symbols-outlined document-tag-filter__icon" aria-hidden="true">filter_list</span>
      {filter.selected && <DocumentTagFilterLabel label={filter.selected.label} />}
    </button>
    {filter.selected &&
      <Link
        to={filter.clearHref}
        className="document-tag-filter__clear grid h-8 w-7 flex-none place-items-center rounded-md"
        aria-label={`Remove tag filter: ${filter.selected.label}`}
        onClick={filter.close}
      >
        <span className="material-symbols-outlined document-tag-filter__clear-icon" aria-hidden="true">close</span>
      </Link>}

    <AnimatePresence>
      {filter.open &&
        <motion.nav
          className="document-tag-filter__menu absolute right-0 z-30 rounded-lg p-1"
          aria-label="Filter by tag"
          variants={DOCUMENT_TAG_FILTER_MENU_VARIANTS}
          initial="closed"
          animate="open"
          exit="closed"
        >
          <ul className="flex flex-col">
            {options.map((option) =>
              <li key={option.key}>
                <Link
                  to={option.href}
                  className="document-tag-filter__option flex h-9 items-center gap-2 rounded-md px-2"
                  data-selected={option.selected}
                  aria-current={option.selected ? 'page' : undefined}
                  onClick={filter.close}
                >
                  <span className="material-symbols-outlined document-tag-filter__check flex-none" aria-hidden="true">check</span>
                  <DocumentTagFilterLabel label={option.label} className="flex-1" />
                  <span className="document-tag-filter__count flex-none">{option.count}</span>
                </Link>
              </li>
            )}
          </ul>
        </motion.nav>}
    </AnimatePresence>
  </div>
}

export default DocumentTagFilter
