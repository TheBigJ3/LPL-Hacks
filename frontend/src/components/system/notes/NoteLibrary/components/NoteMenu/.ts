import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Variants } from 'motion/react'
import { NOTE_LIBRARY_EASE } from '../../.ts'

export const NOTE_MENU_VARIANTS: Variants = {
  closed: { opacity: 0, y: -4, scale: 0.98 },
  open: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: NOTE_LIBRARY_EASE } },
}

export function useNoteMenu(id: string, onView: (id: string) => void, onEdit: (id: string) => void, onDelete: (id: string) => void) {
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

  return {
    open,
    rootRef,
    buttonRef,
    toggle: () => setOpen((value) => !value),
    closeOnEscape,
    view: () => {
      setOpen(false)
      onView(id)
    },
    edit: () => {
      setOpen(false)
      onEdit(id)
    },
    remove: () => {
      setOpen(false)
      onDelete(id)
    },
  }
}
