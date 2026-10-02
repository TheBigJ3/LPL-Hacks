import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { Transition, Variants } from 'motion/react'

const TOOLTIP_GAP = 6
const TOOLTIP_VIEWPORT_MARGIN = 8

export type TooltipPlacement = 'top' | 'bottom'

type TooltipPosition = {
  top: number
  left: number
  placement: TooltipPlacement
}

export const TOOLTIP_VARIANTS: Variants = {
  hidden: (placement: TooltipPlacement) => ({ opacity: 0, y: placement === 'top' ? 4 : -4 }),
  shown: { opacity: 1, y: 0 },
}

export const TOOLTIP_TRANSITION: Transition = { duration: 0.16, ease: 'easeOut' }

function tooltipPlace(trigger: HTMLElement, bubble: HTMLElement): TooltipPosition {
  const anchor = trigger.getBoundingClientRect()
  const width = bubble.offsetWidth
  const height = bubble.offsetHeight
  const maxLeft = window.innerWidth - width - TOOLTIP_VIEWPORT_MARGIN
  const left = Math.max(TOOLTIP_VIEWPORT_MARGIN, Math.min(anchor.left + anchor.width / 2 - width / 2, maxLeft))
  const fitsBelow = anchor.bottom + TOOLTIP_GAP + height <= window.innerHeight - TOOLTIP_VIEWPORT_MARGIN

  return fitsBelow
    ? { top: anchor.bottom + TOOLTIP_GAP, left, placement: 'bottom' }
    : { top: anchor.top - TOOLTIP_GAP - height, left, placement: 'top' }
}

export type TooltipState = {
  open: boolean
  placement: TooltipPlacement
  bubbleStyle: CSSProperties
  triggerRef: RefObject<HTMLSpanElement | null>
  bubbleRef: RefObject<HTMLSpanElement | null>
  showOnHover: (event: ReactPointerEvent) => void
  hideOnLeave: () => void
  showOnFocus: (event: FocusEvent<Element>) => void
  hideOnBlur: () => void
  togglePinned: () => void
}

export function useTooltip(forcedOpen = false): TooltipState {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const bubbleRef = useRef<HTMLSpanElement | null>(null)
  const open = forcedOpen || hovered || focused || pinned

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (triggerRef.current && bubbleRef.current) {
        setPosition(tooltipPlace(triggerRef.current, bubbleRef.current))
      }
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!pinned) return
    const unpinOutside = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) setPinned(false)
    }
    const unpinOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false)
    }
    document.addEventListener('pointerdown', unpinOutside)
    document.addEventListener('keydown', unpinOnEscape)
    return () => {
      document.removeEventListener('pointerdown', unpinOutside)
      document.removeEventListener('keydown', unpinOnEscape)
    }
  }, [pinned])

  return {
    open,
    placement: position?.placement ?? 'bottom',
    bubbleStyle: position
      ? { top: position.top, left: position.left }
      : { top: 0, left: 0, visibility: 'hidden' },
    triggerRef,
    bubbleRef,
    showOnHover: (event) => {
      if (event.pointerType === 'mouse') setHovered(true)
    },
    hideOnLeave: () => setHovered(false),
    showOnFocus: (event) => {
      if (event.target.matches(':focus-visible')) setFocused(true)
    },
    hideOnBlur: () => setFocused(false),
    togglePinned: () => setPinned(!pinned),
  }
}
