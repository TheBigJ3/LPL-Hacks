import { createPortal } from 'react-dom'
import { motion, MotionConfig } from 'motion/react'
import { useInstantCover, useSplashPhase } from '@stores/splashStore.ts'
import { useScrollLock } from '@hooks/useScrollLock.ts'
import {
  splashGlowPopVariants,
  splashOverlayInstantVariants,
  splashOverlayVariants,
  splashPopVariants,
  useCoveringFirstPaint,
  useInertBackground,
} from './.ts'
import './.css'

const SplashLoader = () => {
  const phase = useSplashPhase()
  const visible = phase !== 'hidden'
  const coveringFirstPaint = useCoveringFirstPaint(visible)
  const instantCover = useInstantCover()

  useScrollLock('splash', visible)
  useInertBackground(visible)

  return createPortal(
    visible
      ? (
        <MotionConfig reducedMotion='user'>
          <motion.div
            className='splash-loader fixed inset-0 z-[2000] flex items-center justify-center overflow-hidden'
            role='status'
            aria-live='polite'
            aria-label='Loading'
            variants={coveringFirstPaint || instantCover ? splashOverlayInstantVariants : splashOverlayVariants}
            initial='initial'
            animate={phase === 'exiting' ? 'exit' : 'enter'}
          >
            <motion.div
              className='splash-loader__glow pointer-events-none absolute inset-0'
              variants={splashGlowPopVariants}
              aria-hidden='true'
            />
            <motion.span
              className='relative inline-block size-12 animate-spin rounded-full border-4 border-main-white/20 border-t-main-white motion-reduce:[animation-duration:2.1s]'
              variants={splashPopVariants}
              aria-hidden='true'
            />
          </motion.div>
        </MotionConfig>
      )
      : null,
    document.body
  )
}

export default SplashLoader
