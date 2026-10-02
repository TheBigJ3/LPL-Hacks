import './.css'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { DOCUMENT_TAG_FILTER_HIGHLIGHT_ID, DOCUMENT_TAG_FILTER_TRANSITION } from './.ts'
import type { DocumentTagOption } from '../../.ts'

const DocumentTagFilter = ({ options }: { options: DocumentTagOption[] }) =>
  <nav className="document-tag-filter w-full" aria-label="Filter by tag">
    <ul className="flex flex-wrap justify-center gap-2">
      {options.map((option) =>
        <li key={option.key}>
          <Link
            to={option.href}
            className="document-tag-filter__chip relative flex h-8 items-center gap-2 rounded-full px-3"
            data-selected={option.selected}
            aria-current={option.selected ? 'page' : undefined}
          >
            {option.selected &&
              <motion.span
                layoutId={DOCUMENT_TAG_FILTER_HIGHLIGHT_ID}
                className="document-tag-filter__highlight absolute rounded-full"
                transition={DOCUMENT_TAG_FILTER_TRANSITION}
              />}
            <span className="relative">{option.label}</span>
            <span className="document-tag-filter__count relative">{option.count}</span>
          </Link>
        </li>
      )}
    </ul>
  </nav>

export default DocumentTagFilter
