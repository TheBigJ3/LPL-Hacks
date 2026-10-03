import './.css'
import { useOnboardingReplay } from './.ts'

const OnboardingReplay = () => {
  const replay = useOnboardingReplay()

  if (!replay.available) return null

  return <button type="button" className="onboarding-replay fixed grid place-items-center rounded-full" aria-label="Replay the tour on every page" title="Replay tour" onClick={replay.replay}>
    <span className="material-symbols-outlined" aria-hidden="true">question_mark</span>
  </button>
}

export default OnboardingReplay
