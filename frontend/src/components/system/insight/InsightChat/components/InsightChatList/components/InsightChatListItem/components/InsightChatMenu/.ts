import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Variants } from 'motion/react'

const INSIGHT_CHAT_MENU_WIDTH = 168
const INSIGHT_CHAT_MENU_GAP = 4

export const INSIGHT_CHAT_MENU_VARIANTS: Variants = {
  closed: { opacity: 0, y: -4, scale: 0.98 },
  open: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
}

export function useInsightChatMenu(onRename: () => void, onTogglePin: () => void, onDelete: () => void) {
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const open = position !== null

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPosition(null)
    }
    const close = () => setPosition(null)
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  // Fixed to the viewport so the scrolling chat list can't clip it.
  const toggle = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (open || !rect) return setPosition(null)
    setPosition({ top: rect.bottom + INSIGHT_CHAT_MENU_GAP, left: rect.right - INSIGHT_CHAT_MENU_WIDTH, width: INSIGHT_CHAT_MENU_WIDTH })
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    setPosition(null)
    buttonRef.current?.focus()
  }

  const choose = (action: () => void) => () => {
    setPosition(null)
    action()
  }

  return {
    open,
    position,
    rootRef,
    buttonRef,
    toggle,
    closeOnEscape,
    rename: choose(onRename),
    togglePin: choose(onTogglePin),
    remove: choose(onDelete),
  }
}
