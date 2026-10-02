import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'
import { popupLayer, usePopupStack } from '@stores/popupStore.ts'
import { computePopupLayerViews, isPopupOverlay, popupBackgrounds, usePopupHostEscapeClose, usePopupHostScrollLock } from './.ts'
import './.css'

const PopupHost = () => {
  const stack = usePopupStack()
  const mouseDownOnOverlay = useRef(false)

  const views = computePopupLayerViews(stack)

  usePopupHostScrollLock(stack.length > 0)
  usePopupHostEscapeClose(stack)

  return createPortal(
    <div className='popup-host'>
      <AnimatePresence>
        {views.map(({ entry, visible }) => {
          const Background = popupBackgrounds[entry.popupBackground]

          return (
            <Background
              key={entry.id}
              visible={visible}
              onMouseDown={(e) => { mouseDownOnOverlay.current = isPopupOverlay(e.target) }}
              onMouseUp={(e) => {
                if (mouseDownOnOverlay.current && isPopupOverlay(e.target)) {
                  popupLayer.close(entry.id)
                }
                mouseDownOnOverlay.current = false
              }}
            >
              {entry.element}
            </Background>
          )
        })}
      </AnimatePresence>
    </div>,
    document.body
  )
}

export default PopupHost
