import './.css'
import { createPortal } from 'react-dom'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ONBOARDING_TOUR_CONTENT_VARIANTS, ONBOARDING_TOUR_VARIANTS, useOnboardingTour, type OnboardingTourStep } from './.ts'

type OnboardingTourProps = {
  steps: OnboardingTourStep[]
  storageKey: string
}

const OnboardingTour = ({ steps, storageKey }: OnboardingTourProps) => {
  const tour = useOnboardingTour(steps, storageKey)

  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {tour.open && tour.step &&
          <motion.div className="onboarding-tour fixed inset-0" variants={ONBOARDING_TOUR_VARIANTS} initial="hidden" animate="shown" exit="hidden" onKeyDown={tour.navigateWithKeys}>
            <div className="onboarding-tour__spotlight" style={tour.spotlightStyle} data-ready={!!tour.spotlightStyle} aria-hidden="true" />

            <div
              ref={tour.tooltipRef}
              className="onboarding-tour__tooltip"
              style={tour.tooltipStyle}
              data-placement={tour.placement}
              data-ready={tour.ready}
              role="dialog"
              aria-modal="true"
              aria-labelledby="onboarding-tour-title"
              aria-describedby="onboarding-tour-body"
            >
              <span className="onboarding-tour__arrow" aria-hidden="true" />

              <motion.div
                key={tour.step.target}
                className="flex flex-col gap-1.5"
                custom={tour.direction}
                variants={ONBOARDING_TOUR_CONTENT_VARIANTS}
                initial="enter"
                animate="center"
              >
                <h2 id="onboarding-tour-title" className="onboarding-tour__title flex items-baseline gap-2 pr-7">
                  <span className="onboarding-tour__number">{tour.number}.</span>
                  {tour.step.title}
                </h2>
                <p id="onboarding-tour-body" className="onboarding-tour__body">{tour.step.body}</p>
              </motion.div>

              <button type="button" className="onboarding-tour__close grid place-items-center" aria-label="Skip tour" title="Skip tour" onClick={tour.finish}>
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>

              <div className="onboarding-tour__footer flex items-center justify-between">
                <span className="onboarding-tour__progress">{tour.number} of {tour.total}</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" className="onboarding-tour__nav grid place-items-center" aria-label="Previous step" disabled={tour.first} onClick={tour.back}>
                    <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                  </button>
                  <button ref={tour.nextRef} type="button" className="onboarding-tour__nav onboarding-tour__nav-next grid place-items-center" aria-label={tour.last ? 'Finish tour' : 'Next step'} onClick={tour.next}>
                    <span className="material-symbols-outlined" aria-hidden="true">{tour.last ? 'check' : 'chevron_right'}</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>}
      </AnimatePresence>
    </MotionConfig>,
    document.body
  )
}

export default OnboardingTour
