import { useEffect, useSyncExternalStore } from "react"

export const SPLASH_ENTER_MS = 500
export const SPLASH_MIN_SPIN_MS = 0

export const SPLASH_EXIT_MS = 460
export const SPLASH_SHOW_DELAY_MS = 0

const MIN_VISIBLE_MS = SPLASH_ENTER_MS + SPLASH_MIN_SPIN_MS

export type SplashPhase = "hidden" | "shown" | "exiting"

export type SplashHoldOptions = {
  immediate?: boolean
  reason?: string
}

type Listener = () => void

const now = (): number => performance.now()

class SplashLayer {
  private phase: SplashPhase = "hidden"
  private holds = new Map<number, string>()
  private nextHoldId = 1
  private shownAt = 0

  private instantCover = false

  private showTimer: ReturnType<typeof setTimeout> | null = null
  private exitStartTimer: ReturnType<typeof setTimeout> | null = null
  private exitEndTimer: ReturnType<typeof setTimeout> | null = null

  private listeners = new Set<Listener>()

  hold(options: SplashHoldOptions = {}): () => void {
    const id = this.nextHoldId++
    this.holds.set(id, options.reason ?? "unknown")

    if (options.immediate || this.phase !== "hidden") this.show()
    else this.scheduleShow()

    return () => this.release(id)
  }

  coverThenNavigate(navigate: () => void, reason = "transition"): void {
    this.instantCover = true
    const release = this.hold({ immediate: true, reason })

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        navigate()
        release()
      })
    })
  }

  getHolds = (): string[] => [...this.holds.values()]

  getSnapshot = (): SplashPhase => this.phase

  isInstantCover = (): boolean => this.instantCover

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private release(id: number): void {
    if (!this.holds.delete(id)) return
    if (this.holds.size > 0) return

    this.clearShowTimer()

    if (this.phase === "hidden") return
    if (this.phase === "exiting") return

    this.scheduleExit()
  }

  private scheduleShow(): void {
    if (this.showTimer) return

    this.showTimer = setTimeout(() => {
      this.showTimer = null
      if (this.holds.size > 0) this.show()
    }, SPLASH_SHOW_DELAY_MS)
  }

  private show(): void {
    this.clearShowTimer()
    this.clearExitTimers()

    if (this.phase === "shown") return

    this.shownAt = now()
    this.setPhase("shown")
  }

  private scheduleExit(): void {
    const remaining = MIN_VISIBLE_MS - (now() - this.shownAt)

    this.exitStartTimer = setTimeout(() => {
      this.exitStartTimer = null
      if (this.holds.size > 0) return

      this.setPhase("exiting")

      this.exitEndTimer = setTimeout(() => {
        this.exitEndTimer = null
        if (this.holds.size > 0) return

        this.setPhase("hidden")
      }, SPLASH_EXIT_MS)
    }, Math.max(0, remaining))
  }

  private clearShowTimer(): void {
    if (!this.showTimer) return

    clearTimeout(this.showTimer)
    this.showTimer = null
  }

  private clearExitTimers(): void {
    if (this.exitStartTimer) clearTimeout(this.exitStartTimer)
    if (this.exitEndTimer) clearTimeout(this.exitEndTimer)

    this.exitStartTimer = null
    this.exitEndTimer = null
  }

  private setPhase(next: SplashPhase): void {
    if (this.phase === next) return

    if (next === "hidden") this.instantCover = false

    this.phase = next
    this.listeners.forEach(l => l())
  }
}

export const splashLayer = new SplashLayer()

export function useSplashPhase(): SplashPhase {
  return useSyncExternalStore(splashLayer.subscribe, splashLayer.getSnapshot)
}

export function useInstantCover(): boolean {
  return useSyncExternalStore(splashLayer.subscribe, splashLayer.isInstantCover)
}

export function useSplashHold(active: boolean, options: SplashHoldOptions = {}): void {
  const { immediate, reason } = options

  useEffect(() => {
    if (!active) return

    return splashLayer.hold({ immediate, reason })
  }, [active, immediate, reason])
}
