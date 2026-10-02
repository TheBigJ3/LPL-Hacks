import { useSyncExternalStore } from 'react'

const TICK_MS = 1_000

const listeners = new Set<() => void>()
let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined

const subscribe = (onStoreChange: () => void) => {
  listeners.add(onStoreChange)

  if (!timer) {

    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((listener) => listener())
    }, TICK_MS)
  }

  return () => {
    listeners.delete(onStoreChange)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

const getSnapshot = () => now

export const useNow = () => useSyncExternalStore(subscribe, getSnapshot)
