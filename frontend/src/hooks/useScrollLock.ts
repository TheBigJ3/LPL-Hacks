import { useEffect } from 'react'

const locks = new Map<string, number>()

function scrollLockApply(): void {
  document.documentElement.style.overflow = locks.size > 0 ? 'hidden' : ''
}

function scrollLockAcquire(key: string): void {
  locks.set(key, (locks.get(key) ?? 0) + 1)
  scrollLockApply()
}

function scrollLockRelease(key: string): void {
  const held = (locks.get(key) ?? 1) - 1
  if (held > 0) locks.set(key, held)
  else locks.delete(key)
  scrollLockApply()
}

export const useScrollLock = (key: string, locked: boolean, releaseDelayMs = 0): void => {
  useEffect(() => {
    if (!locked) return

    scrollLockAcquire(key)

    return () => {
      if (releaseDelayMs <= 0) scrollLockRelease(key)
      else setTimeout(() => scrollLockRelease(key), releaseDelayMs)
    }
  }, [key, locked, releaseDelayMs])
}
