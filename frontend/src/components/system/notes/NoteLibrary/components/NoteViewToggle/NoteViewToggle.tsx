import './.css'
import { AnimatePresence, motion } from 'motion/react'
import { NOTE_VIEW_OPTIONS, NOTE_VIEW_TOGGLE_LABEL_VARIANTS } from './.ts'
import type { NoteView } from '../../.ts'

const NoteViewToggle = ({ view, onChange }: { view: NoteView; onChange: (view: NoteView) => void }) =>
  <div data-onboarding="note-view" className="note-view-toggle flex items-center gap-1.5" role="group" aria-label="Note layout">
    {NOTE_VIEW_OPTIONS.map((option) =>
      <button
        key={option.view}
        type="button"
        className="note-view-toggle__option flex items-center rounded-lg p-1"
        data-selected={option.view === view}
        aria-pressed={option.view === view}
        aria-label={option.label}
        onClick={() => onChange(option.view)}
      >
        <span className="material-symbols-outlined note-view-toggle__icon grid flex-none place-items-center" aria-hidden="true">{option.icon}</span>
        <AnimatePresence initial={false}>
          {option.view === view &&
            <motion.span
              className="note-view-toggle__label overflow-hidden whitespace-nowrap"
              variants={NOTE_VIEW_TOGGLE_LABEL_VARIANTS}
              initial="hidden"
              animate="shown"
              exit="hidden"
            >
              <span className="note-view-toggle__label-text block">{option.label}</span>
            </motion.span>}
        </AnimatePresence>
      </button>
    )}
  </div>

export default NoteViewToggle
