import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { TOOLTIP_TRANSITION, TOOLTIP_VARIANTS, useTooltip } from './.ts'

type TooltipProps = {
  text: string
  open?: boolean
  children: ReactNode
}

export default function Tooltip({ text, open = false, children }: TooltipProps) {
  const tooltip = useTooltip(open)

  return (
    <span
      ref={tooltip.triggerRef}
      className='inline-flex items-center'
      onPointerEnter={tooltip.showOnHover}
      onPointerLeave={tooltip.hideOnLeave}
      onFocus={tooltip.showOnFocus}
      onBlur={tooltip.hideOnBlur}
      onClick={tooltip.togglePinned}
    >
      {children}
      {createPortal(
        <AnimatePresence>
          {tooltip.open && (
            <motion.span
              ref={tooltip.bubbleRef}
              role='tooltip'
              className='pointer-events-none fixed z-[1100] w-max max-w-[min(240px,calc(100vw-16px))] rounded-[8px] border border-white/10 bg-main-black px-[10px] py-[8px] font-[Arimo] text-[12px] leading-[1.4] tracking-[-0.24px] text-main-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]'
              style={tooltip.bubbleStyle}
              custom={tooltip.placement}
              variants={TOOLTIP_VARIANTS}
              initial='hidden'
              animate='shown'
              exit='hidden'
              transition={TOOLTIP_TRANSITION}
            >
              {text}
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  )
}
