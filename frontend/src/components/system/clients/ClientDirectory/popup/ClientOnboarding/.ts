import { useEffect, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import type { Variants } from 'motion/react'
import type { ClientKind } from '@lpl-hacks/shared/src/types/native/clients/client'
import type { Params as ClientCreateParams } from '@lpl-hacks/shared/src/types/native/api/v1/clients/create'
import { CLIENT_HOUSEHOLD_MAX_MEMBERS, ClientPersonNameZod } from '@lpl-hacks/shared/src/types/zod/clients/client'
import createClientApi from '@api/clients/createClientApi'
import listClientsApi from '@api/clients/listClientsApi'
import { apiPostRequest } from '@features/apiLayer'
import { queryClient } from '@features/queryClient'
import { CLIENT_ERRORS } from '@typings/native/clients/errors'

export type ClientOnboardingKindOption = {
  kind: ClientKind
  icon: string
  title: string
  hint: string
}

export type ClientOnboardingMemberRow = {
  key: string
  label: string
  name: string
  error: string | null
  autoFocus: boolean
}

type ClientOnboardingMemberDraft = {
  key: string
  name: string
}

export const CLIENT_ONBOARDING_TITLE_ID = 'client-onboarding-title'

export const CLIENT_ONBOARDING_KIND_OPTIONS: ClientOnboardingKindOption[] = [
  { kind: 'household', icon: 'groups', title: 'Household', hint: 'A family that shares documents' },
  { kind: 'individual', icon: 'person', title: 'Individual', hint: 'One person on their own' },
]

const CLIENT_ONBOARDING_EASE = [0.16, 1, 0.3, 1] as const

export const CLIENT_ONBOARDING_OVERLAY_VARIANTS: Variants = {
  closed: { opacity: 0, transition: { duration: 0.16, ease: 'easeIn' } },
  open: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
}

export const CLIENT_ONBOARDING_DIALOG_VARIANTS: Variants = {
  closed: { opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.16, ease: 'easeIn' } },
  open: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: CLIENT_ONBOARDING_EASE } },
}

let clientOnboardingKeySeed = 0

function clientOnboardingNewMember(): ClientOnboardingMemberDraft {
  clientOnboardingKeySeed += 1
  return { key: `member-${clientOnboardingKeySeed}`, name: '' }
}

function clientOnboardingIsFullName(name: string): boolean {
  return ClientPersonNameZod.safeParse(name).success
}

function clientOnboardingSuggestName(members: ClientOnboardingMemberDraft[]): string {
  const named = members.find((member) => clientOnboardingIsFullName(member.name))
  const last = named?.name.trim().split(/\s+/).at(-1)
  return last ? `${last} Household` : ''
}

export function useClientOnboarding(onClose: () => void) {
  const navigate = useNavigate()
  const [kind, setKind] = useState<ClientKind>('household')
  const [personName, setPersonName] = useState('')
  const [householdName, setHouseholdName] = useState<string | null>(null)
  const [members, setMembers] = useState<ClientOnboardingMemberDraft[]>(() => [clientOnboardingNewMember()])
  const [addedKey, setAddedKey] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const suggestion = clientOnboardingSuggestName(members)
  const name = householdName ?? suggestion
  const memberErrors = members.map((member) => clientOnboardingIsFullName(member.name) ? null : CLIENT_ERRORS.FULL_NAME_REQUIRED.MESSAGE)
  const personError = clientOnboardingIsFullName(personName) ? null : CLIENT_ERRORS.FULL_NAME_REQUIRED.MESSAGE
  const nameError = name.trim() ? null : CLIENT_ERRORS.NAME_REQUIRED.MESSAGE
  const valid = kind === 'individual' ? !personError : !nameError && memberErrors.every((error) => !error)

  const params: ClientCreateParams = kind === 'individual'
    ? { kind, name: personName }
    : { kind, name, members: members.map((member) => ({ name: member.name })) }

  function changeKind(next: ClientKind) {
    setKind(next)
    setSubmitted(false)
    setServerError(null)
  }

  function changeMember(key: string, value: string) {
    setMembers((current) => current.map((member) => member.key === key ? { ...member, name: value } : member))
  }

  function addMember() {
    if (members.length >= CLIENT_HOUSEHOLD_MAX_MEMBERS) return
    const member = clientOnboardingNewMember()
    setMembers((current) => [...current, member])
    setAddedKey(member.key)
  }

  function removeMember(key: string) {
    setMembers((current) => current.length > 1 ? current.filter((member) => member.key !== key) : current)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!valid || saving) return

    setSaving(true)
    setServerError(null)
    const res = await apiPostRequest(createClientApi, params)
    if (!res.success) {
      setSaving(false)
      setServerError(res.error.message)
      return
    }

    await queryClient.invalidateQueries({ queryKey: [listClientsApi.identifier] })
    onClose()
    navigate(`/clients/${res.data.client.slug}/extract`)
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || saving) return
    event.stopPropagation()
    onClose()
  }

  function closeOnBackdrop(event: MouseEvent) {
    if (event.target !== event.currentTarget || saving) return
    onClose()
  }

  return {
    kind,
    kindOptions: CLIENT_ONBOARDING_KIND_OPTIONS,
    changeKind,
    personName,
    setPersonName,
    personError: submitted ? personError : null,
    householdName: name,
    householdNameSuggested: householdName === null && !!suggestion,
    setHouseholdName,
    nameError: submitted ? nameError : null,
    members: members.map((member, index): ClientOnboardingMemberRow => ({
      key: member.key,
      label: `Member ${index + 1}`,
      name: member.name,
      error: submitted ? memberErrors[index] ?? null : null,
      autoFocus: member.key === addedKey,
    })),
    canAddMember: members.length < CLIENT_HOUSEHOLD_MAX_MEMBERS,
    canRemoveMember: members.length > 1,
    changeMember,
    addMember,
    removeMember,
    saving,
    serverError,
    submitLabel: saving ? 'Adding…' : 'Add client',
    submit,
    close: () => !saving && onClose(),
    closeOnEscape,
    closeOnBackdrop,
  }
}
