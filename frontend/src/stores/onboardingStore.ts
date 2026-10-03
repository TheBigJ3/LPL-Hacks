import { useSyncExternalStore } from 'react'

type OnboardingReplay = () => void

const ONBOARDING_STORAGE_PREFIX = 'onboarding:'

const onboardingClearSeen = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(ONBOARDING_STORAGE_PREFIX))
      .forEach((key) => localStorage.removeItem(key))
  } catch {
    return
  }
}

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
    onboardingClearSeen()
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
