import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Transition, Variants } from 'motion/react'
import type { DocumentTagOption } from '../../.ts'

export const DOCUMENT_TAG_FILTER_TRANSITION: Transition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] }

export const DOCUMENT_TAG_FILTER_MENU_VARIANTS: Variants = {
  closed: { opacity: 0, y: -4, scale: 0.98 },
  open: { opacity: 1, y: 0, scale: 1, transition: DOCUMENT_TAG_FILTER_TRANSITION },
}

export function useDocumentTagFilter(options: DocumentTagOption[]) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    setOpen(false)
    buttonRef.current?.focus()
  }

  const all = options.find((option) => option.key === 'all')
  const selected = options.find((option) => option.selected && option.key !== 'all') ?? null

  return {
    open,
    selected,
    clearHref: all?.href ?? '?',
    rootRef,
    buttonRef,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
    closeOnEscape,
  }
}
