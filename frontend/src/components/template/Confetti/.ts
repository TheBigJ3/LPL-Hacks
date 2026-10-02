import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'

const BURSTS = [
  { delay: 0, particleCount: 90, spread: 78, angle: 90, originX: 0.5, startVelocity: 52, scalar: 1 },
  { delay: 150, particleCount: 58, spread: 62, angle: 58, originX: 0.04, startVelocity: 60, scalar: 0.9 },
  { delay: 150, particleCount: 58, spread: 62, angle: 122, originX: 0.96, startVelocity: 60, scalar: 0.9 },
  { delay: 520, particleCount: 44, spread: 120, angle: 90, originX: 0.5, startVelocity: 32, scalar: 0.75 },
] as const

export function useConfetti(tint: string) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const fire = confetti.create(canvas, { resize: true, useWorker: false })
    const colors = ['#fafafa', '#ffffff', tint]

    const timers = BURSTS.map((burst) =>
      window.setTimeout(() => {
        void fire({
          colors,
          particleCount: burst.particleCount,
          spread: burst.spread,
          angle: burst.angle,
          startVelocity: burst.startVelocity,
          scalar: burst.scalar,
          origin: { x: burst.originX, y: 0.58 },
          ticks: 280,
          gravity: 0.9,
          decay: 0.92,
        })
      }, burst.delay),
    )

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      fire.reset()
    }
  }, [tint])

  return { ref }
}
