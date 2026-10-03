import { onboardingReplay, useOnboardingAvailable } from '@stores/onboardingStore'

export function useOnboardingReplay() {
  return { available: useOnboardingAvailable(), replay: onboardingReplay }
}
