import './.css'
import type { ClientKind } from '@lpl-hacks/shared/src/types/native/clients/client'
import type { ClientOnboardingKindOption } from '../../.ts'

type ClientOnboardingKindProps = {
  options: ClientOnboardingKindOption[]
  value: ClientKind
  onChange: (kind: ClientKind) => void
}

const ClientOnboardingKind = ({ options, value, onChange }: ClientOnboardingKindProps) =>
  <fieldset className="client-onboarding-kind grid gap-3">
    <legend className="sr-only">Client type</legend>
    {options.map((option) =>
      <label key={option.kind} className="client-onboarding-kind__option flex cursor-pointer items-start gap-3 rounded-lg p-3" data-selected={option.kind === value}>
        <input type="radio" name="client-kind" className="sr-only" value={option.kind} checked={option.kind === value} onChange={() => onChange(option.kind)} />
        <span className="material-symbols-outlined client-onboarding-kind__icon flex-none" aria-hidden="true">{option.icon}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="client-onboarding-kind__title">{option.title}</span>
          <span className="client-onboarding-kind__hint">{option.hint}</span>
        </span>
      </label>
    )}
  </fieldset>

export default ClientOnboardingKind
