import { useSyncExternalStore } from 'react'

type OnboardingReplay = () => void

class OnboardingLayer {
  private replays: OnboardingReplay[] = []
  private listeners = new Set<() => void>()

  getSnapshot = () => this.replays.length > 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  register(replay: OnboardingReplay) {
    this.replays = [...this.replays, replay]
    this.emit()
    return () => {
      this.replays = this.replays.filter((item) => item !== replay)
      this.emit()
    }
  }

  replay() {
    this.replays.at(-1)?.()
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }
}

const onboardingLayer = new OnboardingLayer()

export const onboardingRegister = (replay: OnboardingReplay) => onboardingLayer.register(replay)

export const onboardingReplay = () => onboardingLayer.replay()

export const useOnboardingAvailable = () => useSyncExternalStore(onboardingLayer.subscribe, onboardingLayer.getSnapshot)
