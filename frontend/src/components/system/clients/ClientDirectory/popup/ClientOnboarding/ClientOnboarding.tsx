import './.css'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import {
  CLIENT_ONBOARDING_DIALOG_VARIANTS,
  CLIENT_ONBOARDING_OVERLAY_VARIANTS,
  CLIENT_ONBOARDING_TITLE_ID,
  useClientOnboarding,
} from './.ts'
import ClientOnboardingKind from './components/ClientOnboardingKind/ClientOnboardingKind'
import ClientOnboardingMembers from './components/ClientOnboardingMembers/ClientOnboardingMembers'

const ClientOnboarding = ({ onClose }: { onClose: () => void }) => {
  const onboarding = useClientOnboarding(onClose)

  return createPortal(<motion.div
    className="client-onboarding fixed inset-0 grid place-items-center"
    variants={CLIENT_ONBOARDING_OVERLAY_VARIANTS}
    initial="closed"
    animate="open"
    exit="closed"
    onMouseDown={onboarding.closeOnBackdrop}
  >
    <motion.form
      className="client-onboarding__dialog flex w-full flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby={CLIENT_ONBOARDING_TITLE_ID}
      variants={CLIENT_ONBOARDING_DIALOG_VARIANTS}
      noValidate
      onSubmit={onboarding.submit}
      onKeyDown={onboarding.closeOnEscape}
    >
      <header className="client-onboarding__header flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={CLIENT_ONBOARDING_TITLE_ID} className="client-onboarding__title">Add client</h2>
          <p className="client-onboarding__subtitle">Documents are tagged to the people you add here, so use the names printed on their forms.</p>
        </div>
        <button type="button" className="client-onboarding__close grid flex-none place-items-center rounded-full" aria-label="Close" onClick={onboarding.close}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <div className="client-onboarding__body flex flex-col gap-6">
        <ClientOnboardingKind options={onboarding.kindOptions} value={onboarding.kind} onChange={onboarding.changeKind} />

        {onboarding.kind === 'individual'
          ? <label className="client-onboarding__field flex flex-col gap-1.5">
            <span className="client-onboarding__label">Full name</span>
            <input
              className="client-onboarding__input h-11 rounded-lg px-3"
              placeholder="First and last name"
              autoComplete="off"
              autoFocus
              value={onboarding.personName}
              aria-invalid={!!onboarding.personError}
              onChange={(event) => onboarding.setPersonName(event.target.value)}
            />
            {onboarding.personError && <span className="client-onboarding__error" role="alert">{onboarding.personError}</span>}
          </label>
          : <>
            <ClientOnboardingMembers
              rows={onboarding.members}
              canAdd={onboarding.canAddMember}
              canRemove={onboarding.canRemoveMember}
              onChange={onboarding.changeMember}
              onAdd={onboarding.addMember}
              onRemove={onboarding.removeMember}
            />
            <label className="client-onboarding__field flex flex-col gap-1.5">
              <span className="client-onboarding__label">Household name</span>
              <input
                className="client-onboarding__input h-11 rounded-lg px-3"
                placeholder="e.g. Johnson Household"
                autoComplete="off"
                value={onboarding.householdName}
                aria-invalid={!!onboarding.nameError}
                onChange={(event) => onboarding.setHouseholdName(event.target.value)}
              />
              {onboarding.nameError
                ? <span className="client-onboarding__error" role="alert">{onboarding.nameError}</span>
                : onboarding.householdNameSuggested && <span className="client-onboarding__hint">Filled in from the first member's last name</span>}
            </label>
          </>}
      </div>

      <footer className="client-onboarding__footer flex flex-wrap items-center justify-end gap-3">
        {onboarding.serverError && <p className="client-onboarding__error mr-auto" role="alert">{onboarding.serverError}</p>}
        <button type="button" className="client-onboarding__cancel h-11 rounded-lg px-4" onClick={onboarding.close}>Cancel</button>
        <button type="submit" className="client-onboarding__submit flex h-11 items-center gap-2 rounded-lg px-4" disabled={onboarding.saving}>
          {onboarding.saving && <span className="material-symbols-outlined client-onboarding__spinner" aria-hidden="true">progress_activity</span>}
          {onboarding.submitLabel}
        </button>
      </footer>
    </motion.form>
  </motion.div>, document.body)
}

export default ClientOnboarding
