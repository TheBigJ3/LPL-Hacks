import './.css'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { DOCUMENT_TAG_FILTER_MENU_VARIANTS, useDocumentTagFilter } from './.ts'
import type { DocumentTagOption } from '../../.ts'

const DocumentTagFilter = ({ options }: { options: DocumentTagOption[] }) => {
  const filter = useDocumentTagFilter()
  const selected = options.find((option) => option.selected && option.key !== 'all')

  return <div ref={filter.rootRef} className="document-tag-filter relative flex-none" onKeyDown={filter.closeOnEscape}>
    <button
      ref={filter.buttonRef}
      type="button"
      className="document-tag-filter__button flex h-8 items-center gap-1 rounded-md px-2"
      data-active={!!selected}
      aria-haspopup="true"
      aria-expanded={filter.open}
      aria-label={selected ? `Filter by tag: ${selected.label}` : 'Filter by tag'}
      onClick={filter.toggle}
    >
      <span className="material-symbols-outlined document-tag-filter__icon" aria-hidden="true">filter_list</span>
      {selected && <span className="document-tag-filter__value truncate">{selected.label}</span>}
    </button>

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
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
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
