import { useState } from 'react'
import type { Variants } from 'motion/react'
import type { Client, ClientKind } from '@lpl-hacks/shared/src/types/native/clients/client'
import listClientsApi from '@api/clients/listClientsApi'
import { useApiGetQuery } from '@features/apiLayer'
import { CLIENT_ERRORS } from '@typings/native/clients/errors'

export type ClientCardPerson = {
  key: string
  initial: string
  name: string
}

export type ClientCardView = {
  id: string
  href: string
  name: string
  initial: string
  kind: ClientKind
  detail: string
  people: ClientCardPerson[]
  extraPeople: number
}

const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  household: 'Household',
  individual: 'Individual',
}

const CLIENT_CARD_PEOPLE_LIMIT = 4

const CLIENT_DIRECTORY_EASE = [0.16, 1, 0.3, 1] as const

export const CLIENT_DIRECTORY_LIST_VARIANTS: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2, ease: 'easeInOut', staggerChildren: 0.03 } },
}

export const CLIENT_DIRECTORY_ITEM_VARIANTS: Variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0, transition: { duration: 0.28, ease: CLIENT_DIRECTORY_EASE } },
}

function clientGetInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

function clientBuildDetail(client: Client): string {
  const kind = CLIENT_KIND_LABELS[client.kind]
  if (client.kind === 'individual') return kind
  return `${kind} · ${client.members.length} ${client.members.length === 1 ? 'member' : 'members'}`
}

function clientBuildCard(client: Client): ClientCardView {
  const people = client.kind === 'individual' ? [] : client.members
  return {
    id: client.id,
    href: `/clients/${client.slug}`,
    name: client.name,
    initial: clientGetInitial(client.name),
    kind: client.kind,
    detail: clientBuildDetail(client),
    people: people.slice(0, CLIENT_CARD_PEOPLE_LIMIT).map((member) => ({ key: member.id, initial: clientGetInitial(member.name), name: member.name })),
    extraPeople: Math.max(0, people.length - CLIENT_CARD_PEOPLE_LIMIT),
  }
}

function clientMatchesSearch(client: Client, needle: string): boolean {
  if (!needle) return true
  return client.name.toLowerCase().includes(needle) || client.members.some((member) => member.name.toLowerCase().includes(needle))
}

export function useClientDirectory() {
  const clientsQuery = useApiGetQuery(listClientsApi)
  const [query, setQuery] = useState('')
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  const clients = clientsQuery.data?.clients ?? []
  const needle = query.trim().toLowerCase()
  const cards = clients.filter((client) => clientMatchesSearch(client, needle)).map(clientBuildCard)
  const hasClients = clients.length > 0

  return {
    loading: clientsQuery.isPending,
    error: clientsQuery.isError ? CLIENT_ERRORS.LOAD_FAILED.MESSAGE : null,
    total: clients.length,
    cards,
    query,
    setQuery,
    clearQuery: () => setQuery(''),
    empty: hasClients
      ? { title: 'No clients match that search', subtitle: 'Try a household name or one of its members', canAdd: false }
      : { title: 'No clients yet', subtitle: 'Add a household or an individual to start bringing in their documents', canAdd: true },
    onboarding: {
      open: onboardingOpen,
      start: () => setOnboardingOpen(true),
      close: () => setOnboardingOpen(false),
    },
  }
}
