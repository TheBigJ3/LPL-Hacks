import { useCallback, useEffect, useRef } from 'react'
import { useMotionValue, useSpring, type MotionValue, type SpringOptions } from 'motion/react'

type ScrollDriftOptions = {

  boundRatio?: number

  velocityScale?: number

  spring?: SpringOptions

  enabled?: boolean
}

type ScrollDrift<T extends HTMLElement> = {
  y: MotionValue<number>
  ref: (node: T | null) => void
}

type ScrollSource = {
  velocity: number
  listeners: Set<() => void>
}

const DEFAULT_SPRING: SpringOptions = { stiffness: 120, damping: 22, mass: 0.9 }

const SCROLL_SETTLE_MS = 90

let scrollSource: ScrollSource | null = null
let scrollSourceTeardown: (() => void) | null = null

function scrollSourceEnsure(): ScrollSource {
  if (scrollSource) return scrollSource

  const source: ScrollSource = { velocity: 0, listeners: new Set() }
  scrollSource = source

  let lastY = window.scrollY
  let lastTime = performance.now()
  let settleTimer = 0

  const notify = () => source.listeners.forEach((listener) => listener())

  const onScroll = () => {
    const now = performance.now()
    const currentY = window.scrollY
    const elapsed = now - lastTime

    if (elapsed > 0) {
      source.velocity = (currentY - lastY) / elapsed
      notify()
    }

    lastY = currentY
    lastTime = now

    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      source.velocity = 0
      notify()
    }, SCROLL_SETTLE_MS)
  }

  window.addEventListener('scroll', onScroll, { passive: true })

  scrollSourceTeardown = () => {
    window.removeEventListener('scroll', onScroll)
    window.clearTimeout(settleTimer)
    scrollSource = null
    scrollSourceTeardown = null
  }

  return source
}

function scrollSourceSubscribe(listener: () => void): () => void {
  const source = scrollSourceEnsure()
  source.listeners.add(listener)

  return () => {
    source.listeners.delete(listener)
    if (source.listeners.size === 0) scrollSourceTeardown?.()
  }
}

function scrollDriftClamp(value: number, bound: number): number {
  if (value > bound) return bound
  if (value < -bound) return -bound
  return value
}

export function useScrollDrift<T extends HTMLElement>({
  boundRatio = 0.02,
  velocityScale = 30,
  spring = DEFAULT_SPRING,
  enabled = true,
}: ScrollDriftOptions = {}): ScrollDrift<T> {
  const target = useMotionValue(0)
  const y = useSpring(target, spring)
  const heightRef = useRef(0)

  const ref = useCallback((node: T | null) => {
    heightRef.current = node ? node.getBoundingClientRect().height : 0
  }, [])

  useEffect(() => {
    if (!enabled) {
      target.set(0)
      return
    }

    const update = () => {
      const bound = heightRef.current * boundRatio
      if (bound <= 0) {
        target.set(0)
        return
      }
      const velocity = scrollSource?.velocity ?? 0
      target.set(scrollDriftClamp(-velocity * velocityScale, bound))
    }

    const unsubscribe = scrollSourceSubscribe(update)

    return () => {
      unsubscribe()
      target.set(0)
    }
  }, [enabled, boundRatio, velocityScale, target])

  return { y, ref }
}
