import { useEffect, useState, type CSSProperties } from 'react'

type SplashScreenPhase = 'playing' | 'exiting' | 'hidden'

type SplashScreenTimeline = {
  squareMs: number
  innerDelayMs: number
  innerMs: number
  outerDelayMs: number
  outerMs: number
  holdMs: number
  exitMs: number
}

const SPLASH_SCREEN_TIMELINE: SplashScreenTimeline = {
  squareMs: 650,
  innerDelayMs: 260,
  innerMs: 770,
  outerDelayMs: 440,
  outerMs: 820,
  holdMs: 300,
  exitMs: 520,
}

const SPLASH_SCREEN_REDUCED_TIMELINE: SplashScreenTimeline = {
  squareMs: 0,
  innerDelayMs: 0,
  innerMs: 0,
  outerDelayMs: 0,
  outerMs: 0,
  holdMs: 600,
  exitMs: 300,
}

export const SPLASH_SCREEN_MARK_VIEW_BOX = '0 0 16.0787 16.2565'

export const SPLASH_SCREEN_MARK_PATHS = {
  square: 'M0 16.0914H4.28444V11.7968H0V16.0914Z',
  inner: 'M0 9.19111H6.89016V16.0889H10.1943V5.88698H0V9.19111Z',
  outer: 'M0 0.00253968V3.30413H12.7771V16.0889H16.0787V0H0V0.00253968Z',
}

const splashScreenGetTimeline = (): SplashScreenTimeline =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? SPLASH_SCREEN_REDUCED_TIMELINE : SPLASH_SCREEN_TIMELINE

const splashScreenCreateStyle = (timeline: SplashScreenTimeline) => ({
  '--splash-screen-square-ms': `${timeline.squareMs}ms`,
  '--splash-screen-inner-delay-ms': `${timeline.innerDelayMs}ms`,
  '--splash-screen-inner-ms': `${timeline.innerMs}ms`,
  '--splash-screen-outer-delay-ms': `${timeline.outerDelayMs}ms`,
  '--splash-screen-outer-ms': `${timeline.outerMs}ms`,
  '--splash-screen-exit-ms': `${timeline.exitMs}ms`,
}) as CSSProperties

export function useSplashScreen() {
  const [phase, setPhase] = useState<SplashScreenPhase>('playing')
  const [timeline] = useState(splashScreenGetTimeline)

  useEffect(() => {
    const exitAt = Math.max(timeline.squareMs, timeline.innerDelayMs + timeline.innerMs, timeline.outerDelayMs + timeline.outerMs) + timeline.holdMs
    const timers = [
      window.setTimeout(() => setPhase('exiting'), exitAt),
      window.setTimeout(() => setPhase('hidden'), exitAt + timeline.exitMs),
    ]
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [timeline])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root || phase === 'hidden') return
    root.inert = true
    return () => { root.inert = false }
  }, [phase])

  return { phase, visible: phase !== 'hidden', style: splashScreenCreateStyle(timeline) }
}
