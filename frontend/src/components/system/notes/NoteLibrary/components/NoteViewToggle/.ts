import type { Transition, Variants } from 'motion/react'
import { NOTE_LIBRARY_EASE, type NoteView } from '../../.ts'

export const NOTE_VIEW_OPTIONS: { view: NoteView; label: string; icon: string }[] = [
  { view: 'grid', label: 'Grid', icon: 'grid_view' },
  { view: 'list', label: 'List', icon: 'format_list_bulleted' },
]

export const NOTE_VIEW_TOGGLE_TRANSITION: Transition = { duration: 0.32, ease: NOTE_LIBRARY_EASE }

export const NOTE_VIEW_TOGGLE_LABEL_VARIANTS: Variants = {
  hidden: { width: 0, opacity: 0, transition: NOTE_VIEW_TOGGLE_TRANSITION },
  shown: { width: 'auto', opacity: 1, transition: NOTE_VIEW_TOGGLE_TRANSITION },
}

