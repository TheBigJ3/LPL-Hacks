import './.css'
import type { ClientOnboardingMemberRow } from '../../.ts'

type ClientOnboardingMembersProps = {
  rows: ClientOnboardingMemberRow[]
  canAdd: boolean
  canRemove: boolean
  onChange: (key: string, name: string) => void
  onAdd: () => void
  onRemove: (key: string) => void
}

const ClientOnboardingMembers = ({ rows, canAdd, canRemove, onChange, onAdd, onRemove }: ClientOnboardingMembersProps) =>
  <fieldset className="client-onboarding-members flex flex-col gap-2">
    <legend className="client-onboarding-members__legend">Household members</legend>
    <ol className="flex flex-col gap-2">
      {rows.map((row, index) =>
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              className="client-onboarding-members__input h-11 min-w-0 flex-1 rounded-lg px-3"
              placeholder="First and last name"
              aria-label={row.label}
              autoComplete="off"
              autoFocus={row.autoFocus || index === 0}
              value={row.name}
              aria-invalid={!!row.error}
              onChange={(event) => onChange(row.key, event.target.value)}
            />
            {canRemove &&
              <button type="button" className="client-onboarding-members__remove grid flex-none place-items-center rounded-lg" aria-label={`Remove ${row.name.trim() || row.label}`} onClick={() => onRemove(row.key)}>
                <span className="material-symbols-outlined" aria-hidden="true">remove_circle_outline</span>
              </button>}
          </div>
          {row.error && <span className="client-onboarding-members__error" role="alert">{row.error}</span>}
        </li>
      )}
    </ol>
    {canAdd &&
      <button type="button" className="client-onboarding-members__add flex items-center gap-1.5 self-start rounded-md" onClick={onAdd}>
        <span className="material-symbols-outlined" aria-hidden="true">add</span>
        Add member
      </button>}
  </fieldset>

export default ClientOnboardingMembers
