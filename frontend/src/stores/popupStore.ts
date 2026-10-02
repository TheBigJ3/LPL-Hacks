import { cloneElement, useSyncExternalStore, type ReactElement } from "react"

export type PopupBackgroundKey = 'radial-dark'

export const DEFAULT_POPUP_BACKGROUND: PopupBackgroundKey = 'radial-dark'

export type PopupSettings = {

  popupBackground?: PopupBackgroundKey
}

export type PopupOptions = {

  layer?: boolean
  settings?: PopupSettings
}

export type PopupComponentProps = {

  id?: string
}

export type PopupEntry = {
  id: string
  layer: boolean
  popupBackground: PopupBackgroundKey
  element: ReactElement<PopupComponentProps>
}

type Listener = () => void

class PopupLayer {
  private stack: PopupEntry[] = []
  private listeners = new Set<Listener>()

  open(id: string, element: ReactElement<PopupComponentProps>, options: PopupOptions = {}): void {
    const cloned = cloneElement(element, { id })
    const popupBackground = options.settings?.popupBackground ?? DEFAULT_POPUP_BACKGROUND

    this.stack = this.stack.some(p => p.id === id)
      ? this.stack.map(p => p.id === id ? { ...p, element: cloned, popupBackground } : p)
      : [...this.stack, { id, layer: options.layer ?? false, popupBackground, element: cloned }]

    this.notify()
  }

  close(id: string): void {
    if (!this.stack.some(p => p.id === id)) return

    this.stack = this.stack.filter(p => p.id !== id)
    this.notify()
  }

  getSnapshot = (): PopupEntry[] => this.stack

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    this.listeners.forEach(l => l())
  }
}

export const popupLayer = new PopupLayer()

export function popup(id: string, element: ReactElement<PopupComponentProps>, options?: PopupOptions): void {
  popupLayer.open(id, element, options)
}

export function close(id: string): void {
  popupLayer.close(id)
}

export function usePopupStack(): PopupEntry[] {
  return useSyncExternalStore(popupLayer.subscribe, popupLayer.getSnapshot)
}
