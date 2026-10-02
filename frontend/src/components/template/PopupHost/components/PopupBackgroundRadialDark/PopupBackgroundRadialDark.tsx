import { motion } from 'motion/react'
import type { PopupBackgroundProps } from '../../.ts'
import './.css'

const PopupBackgroundRadialDark = ({ visible, onMouseDown, onMouseUp, children }: PopupBackgroundProps) => {
  return (
    <motion.div
      className='popup-background-radial-dark popup-host__overlay'
      data-visible={visible}
      data-lenis-prevent
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <motion.div
        className='popup-background-radial-dark__content'
        initial={{ scale: 0.94 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.94 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

export default PopupBackgroundRadialDark
