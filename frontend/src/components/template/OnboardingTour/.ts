import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Variants } from 'motion/react'
import { onboardingRegister } from '@stores/onboardingStore'

export type OnboardingTourPlacement = 'top' | 'bottom' | 'left' | 'right'

export type OnboardingTourStep = {
  target: string
  title: string
  body: string
  placement: OnboardingTourPlacement
}

type OnboardingTourRect = { top: number; left: number; width: number; height: number }

type OnboardingTourSize = { width: number; height: number }

const ONBOARDING_TOUR_GAP = 16
const ONBOARDING_TOUR_SPOTLIGHT_PADDING = 6
const ONBOARDING_TOUR_VIEWPORT_MARGIN = 12
const ONBOARDING_TOUR_ARROW_INSET = 22
// Waits out the SplashScreen timeline so the tour never opens underneath it.
const ONBOARDING_TOUR_START_DELAY_MS = 1500

const ONBOARDING_TOUR_OPPOSITE: Record<OnboardingTourPlacement, OnboardingTourPlacement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

const ONBOARDING_TOUR_EASE = [0.16, 1, 0.3, 1] as const

export const ONBOARDING_TOUR_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.24, ease: 'easeOut' } },
}

export const ONBOARDING_TOUR_CONTENT_VARIANTS: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 12 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.26, ease: ONBOARDING_TOUR_EASE } },
}

const onboardingTourSelector = (target: string) => `[data-onboarding="${target}"]`

const onboardingTourFindTarget = (step: OnboardingTourStep | undefined) => {
  if (!step) return null
  const element = document.querySelector<HTMLElement>(onboardingTourSelector(step.target))
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height || rect.right <= 0 || rect.left >= window.innerWidth) return null
  return element
}

const onboardingTourFindVisible = (steps: OnboardingTourStep[], from: number, direction: 1 | -1) => {
  for (let index = from; index >= 0 && index < steps.length; index += direction) {
    if (onboardingTourFindTarget(steps[index])) return index
  }
  return null
}

const onboardingTourReadSeen = (storageKey: string) => {
  try {
    return localStorage.getItem(storageKey) === 'true'
  } catch {
    return true
  }
}

const onboardingTourWriteSeen = (storageKey: string) => {
  try {
    localStorage.setItem(storageKey, 'true')
  } catch {
    return
  }
}

const onboardingTourRectEquals = (a: OnboardingTourRect | null, b: OnboardingTourRect) =>
  !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height

const onboardingTourClamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

const onboardingTourGetLayout = (target: OnboardingTourRect, tooltip: OnboardingTourSize, preferred: OnboardingTourPlacement) => {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = ONBOARDING_TOUR_VIEWPORT_MARGIN
  const fits: Record<OnboardingTourPlacement, boolean> = {
    top: target.top - ONBOARDING_TOUR_GAP - tooltip.height >= margin,
    bottom: target.top + target.height + ONBOARDING_TOUR_GAP + tooltip.height <= viewportHeight - margin,
    left: target.left - ONBOARDING_TOUR_GAP - tooltip.width >= margin,
    right: target.left + target.width + ONBOARDING_TOUR_GAP + tooltip.width <= viewportWidth - margin,
  }
  const order: OnboardingTourPlacement[] = [preferred, ONBOARDING_TOUR_OPPOSITE[preferred], 'bottom', 'top', 'right', 'left']
  const placement = order.find((option) => fits[option]) ?? preferred
  const vertical = placement === 'top' || placement === 'bottom'
  const centerX = target.left + target.width / 2
  const centerY = target.top + target.height / 2

  const rawLeft = vertical
    ? centerX - tooltip.width / 2
    : placement === 'right' ? target.left + target.width + ONBOARDING_TOUR_GAP : target.left - ONBOARDING_TOUR_GAP - tooltip.width
  const rawTop = vertical
    ? placement === 'bottom' ? target.top + target.height + ONBOARDING_TOUR_GAP : target.top - ONBOARDING_TOUR_GAP - tooltip.height
    : centerY - tooltip.height / 2

  const left = onboardingTourClamp(rawLeft, margin, viewportWidth - margin - tooltip.width)
  const top = onboardingTourClamp(rawTop, margin, viewportHeight - margin - tooltip.height)
  const arrow = vertical
    ? onboardingTourClamp(centerX - left, ONBOARDING_TOUR_ARROW_INSET, tooltip.width - ONBOARDING_TOUR_ARROW_INSET)
    : onboardingTourClamp(centerY - top, ONBOARDING_TOUR_ARROW_INSET, tooltip.height - ONBOARDING_TOUR_ARROW_INSET)

  return {
    placement,
    style: { top, left, '--onboarding-tour-arrow-offset': `${arrow}px` } as CSSProperties,
  }
}

const onboardingTourGetSpotlightStyle = (target: OnboardingTourRect): CSSProperties => ({
  top: target.top - ONBOARDING_TOUR_SPOTLIGHT_PADDING,
  left: target.left - ONBOARDING_TOUR_SPOTLIGHT_PADDING,
  width: target.width + ONBOARDING_TOUR_SPOTLIGHT_PADDING * 2,
  height: target.height + ONBOARDING_TOUR_SPOTLIGHT_PADDING * 2,
})

export function useOnboardingTour(steps: OnboardingTourStep[], storageKey: string) {
  const [index, setIndex] = useState<number | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [targetRect, setTargetRect] = useState<OnboardingTourRect | null>(null)
  const [tooltipSize, setTooltipSize] = useState<OnboardingTourSize | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)

  const open = index !== null
  const step = open ? steps[index] : undefined

  const finish = () => {
    onboardingTourWriteSeen(storageKey)
    setIndex(null)
    setTargetRect(null)
  }

  const goTo = (from: number, towards: 1 | -1) => {
    const found = onboardingTourFindVisible(steps, from, towards)
    if (found === null) return towards === 1 ? finish() : undefined
    setDirection(towards)
    setIndex(found)
  }

  useEffect(() => {
    if (onboardingTourReadSeen(storageKey)) return
    const timer = window.setTimeout(() => {
      const first = onboardingTourFindVisible(steps, 0, 1)
      if (first !== null) setIndex(first)
    }, ONBOARDING_TOUR_START_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [steps, storageKey])

  useEffect(() => onboardingRegister(() => {
    const first = onboardingTourFindVisible(steps, 0, 1)
    if (first === null) return
    setDirection(1)
    setIndex(first)
  }), [steps])

  useEffect(() => {
    if (!step) return
    onboardingTourFindTarget(step)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    nextRef.current?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    if (!step) return
    let frame = 0
    let lastRect: OnboardingTourRect | null = null
    let lastSize: OnboardingTourSize | null = null

    const track = () => {
      const element = onboardingTourFindTarget(step)
      if (element) {
        const { top, left, width, height } = element.getBoundingClientRect()
        const rect = { top, left, width, height }
        if (!onboardingTourRectEquals(lastRect, rect)) setTargetRect(lastRect = rect)
      }
      const tooltip = tooltipRef.current
      if (tooltip && (lastSize?.width !== tooltip.offsetWidth || lastSize?.height !== tooltip.offsetHeight)) {
        setTooltipSize(lastSize = { width: tooltip.offsetWidth, height: tooltip.offsetHeight })
      }
      frame = window.requestAnimationFrame(track)
    }

    track()
    return () => window.cancelAnimationFrame(frame)
  }, [step])

  const next = () => index !== null && goTo(index + 1, 1)
  const back = () => index !== null && goTo(index - 1, -1)

  const navigateWithKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') finish()
    if (event.key === 'ArrowRight') next()
    if (event.key === 'ArrowLeft') back()
  }

  const layout = targetRect && tooltipSize && step ? onboardingTourGetLayout(targetRect, tooltipSize, step.placement) : null

  return {
    open,
    step,
    number: (index ?? 0) + 1,
    total: steps.length,
    first: index === 0,
    last: index === steps.length - 1,
    direction,
    ready: !!layout,
    placement: layout?.placement ?? step?.placement,
    tooltipStyle: layout?.style,
    spotlightStyle: targetRect ? onboardingTourGetSpotlightStyle(targetRect) : undefined,
    tooltipRef,
    nextRef,
    next,
    back,
    finish,
    navigateWithKeys,
  }
}
