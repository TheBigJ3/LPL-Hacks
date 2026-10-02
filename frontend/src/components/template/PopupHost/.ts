import { useEffect, type ComponentType, type MouseEventHandler, type ReactNode } from 'react'
import { useScrollLock } from '@hooks/useScrollLock.ts'
import { popupLayer, type PopupBackgroundKey, type PopupEntry } from '@stores/popupStore.ts'
import PopupBackgroundRadialDark from './components/PopupBackgroundRadialDark/PopupBackgroundRadialDark.tsx'

export type PopupLayerView = {
  entry: PopupEntry
  visible: boolean
}

export function computePopupLayerViews(stack: PopupEntry[]): PopupLayerView[] {
  const views: PopupLayerView[] = []
  let chainVisible = true

  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    views.unshift({ entry, visible: chainVisible })
    chainVisible = chainVisible && entry.layer
  }

  return views
}

export const POPUP_OVERLAY_CLASS = 'popup-host__overlay'

export function isPopupOverlay(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.classList.contains(POPUP_OVERLAY_CLASS)
}

export type PopupBackgroundProps = {
  visible: boolean
  onMouseDown: MouseEventHandler<HTMLDivElement>
  onMouseUp: MouseEventHandler<HTMLDivElement>
  children: ReactNode
}

export const popupBackgrounds: Record<PopupBackgroundKey, ComponentType<PopupBackgroundProps>> = {
  'radial-dark': PopupBackgroundRadialDark,
}

// Must match the exit transition in PopupBackgroundRadialDark.
const POPUP_EXIT_MS = 200

export function usePopupHostScrollLock(open: boolean): void {
  useScrollLock('popup', open, POPUP_EXIT_MS)
}

export function usePopupHostEscapeClose(stack: PopupEntry[]): void {
  const topId = stack.at(-1)?.id

  useEffect(() => {
    if (!topId) return

    const closingId = topId

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return

      event.preventDefault()
      popupLayer.close(closingId)
    }

    window.addEventListener('keydown', closeOnEscape)

    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [topId])
}
