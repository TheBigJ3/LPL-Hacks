import type { MouseEvent } from 'react'
import { useMotionValue, useSpring, useTransform, type MotionValue, type SpringOptions } from 'motion/react'

type Tilt3DOptions = {

  maxTilt?: number

  spring?: SpringOptions
}

type Tilt3D = {
  rotateX: MotionValue<number>
  rotateY: MotionValue<number>
  onMouseMove: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
}

const DEFAULT_SPRING: SpringOptions = { stiffness: 200, damping: 18, mass: 0.6 }

export const useTilt3D = ({ maxTilt = 14, spring = DEFAULT_SPRING }: Tilt3DOptions = {}): Tilt3D => {
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)

  const rotateX = useSpring(useTransform(py, [0, 1], [maxTilt, -maxTilt]), spring)
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxTilt, maxTilt]), spring)

  const onMouseMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    px.set((event.clientX - rect.left) / rect.width)
    py.set((event.clientY - rect.top) / rect.height)
  }

  const onMouseLeave = () => {
    px.set(0.5)
    py.set(0.5)
  }

  return { rotateX, rotateY, onMouseMove, onMouseLeave }
}
