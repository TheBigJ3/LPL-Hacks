import { useEffect, useRef } from 'react'
import type { Variants } from 'motion/react'

export const splashOverlayVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.14, ease: 'easeOut' } },

  exit: { opacity: 0, transition: { duration: 0.22, ease: 'easeInOut', delay: 0.2 } },
}

export const splashPopVariants: Variants = {
  initial: { scale: 0.55, opacity: 0 },
  enter: {
    scale: 1,
    opacity: 1,
    transition: {
      scale: { type: 'spring', stiffness: 260, damping: 20, mass: 0.9 },
      opacity: { duration: 0.16, ease: 'easeOut' },
    },
  },
  exit: {
    scale: 0.62,
    opacity: 0,
    transition: {
      scale: { duration: 0.18, ease: 'easeIn' },
      opacity: { duration: 0.16, ease: 'easeIn', delay: 0.04 },
    },
  },
}

export const splashGlowPopVariants: Variants = {
  initial: { scale: 0.55, opacity: 0 },
  enter: {
    scale: 1,
    opacity: 0.5,
    transition: {
      scale: { type: 'spring', stiffness: 260, damping: 20, mass: 0.9 },
      opacity: { duration: 0.16, ease: 'easeOut' },
    },
  },
  exit: {
    scale: 0.62,
    opacity: 0,
    transition: {
      scale: { duration: 0.18, ease: 'easeIn' },
      opacity: { duration: 0.16, ease: 'easeIn', delay: 0.04 },
    },
  },
}

export const splashOverlayInstantVariants: Variants = {
  ...splashOverlayVariants,
  initial: { opacity: 1 },
}

export function useCoveringFirstPaint(visible: boolean): boolean {
  const firstPaint = useRef(visible)

  useEffect(() => {
    if (!visible) firstPaint.current = false
  }, [visible])

  return firstPaint.current
}

export function useInertBackground(active: boolean): void {
  useEffect(() => {
    if (!active) return

    const root = document.getElementById('root')
    if (!root) return

    root.inert = true

    return () => {
      root.inert = false
    }
  }, [active])
}
