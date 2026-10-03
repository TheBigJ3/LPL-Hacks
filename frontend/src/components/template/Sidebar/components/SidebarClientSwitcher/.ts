import { useEffect, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { Variants } from 'motion/react'
import type { Client, ClientKind, ClientMember } from '@lpl-hacks/shared/src/types/native/clients/client'
import listClientsApi from '@api/clients/listClientsApi'
import { useApiGetQuery } from '@features/apiLayer'
import { SIDEBAR_SWAP_TRANSITION } from '../../.ts'

export type SidebarClientOption = {
  id: string
  name: string
  kind: ClientKind
  initial: string
  detail: string
  active: boolean
}

export const SIDEBAR_CLIENT_PICKER_ID = 'sidebar-client-picker'
export const SIDEBAR_CLIENT_TRIGGER_ID = 'sidebar-client-trigger'

export const SIDEBAR_CLIENT_SWAP_VARIANTS: Variants = {
  enter: { opacity: 0, y: 10, scale: 0.92 },
  center: { opacity: 1, y: 0, scale: 1, transition: SIDEBAR_SWAP_TRANSITION },
  exit: { opacity: 0, y: -10, scale: 0.92, transition: { duration: 0.14, ease: 'easeIn' } },
}

export const SIDEBAR_CLIENT_PICKER_VARIANTS: Variants = {
  closed: { height: 0, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } },
  open: { height: 'auto', opacity: 1, transition: SIDEBAR_SWAP_TRANSITION },
}

const SIDEBAR_CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  household: 'Household',
  individual: 'Individual',
}

const SIDEBAR_CLIENT_RECENT_STORAGE_KEY = 'sidebar:recent-clients'
const SIDEBAR_CLIENT_RECENT_LIMIT = 4
const SIDEBAR_CLIENT_DEFAULT_RECENT_COUNT = 3

const sidebarClientReadRecent = (): string[] | null => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SIDEBAR_CLIENT_RECENT_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(stored)) return null
    return stored.filter((id): id is string => typeof id === 'string')
  } catch {
    return null
  }
}

const sidebarClientGetDefaultRecent = (clients: Client[]) =>
  clients.slice(0, SIDEBAR_CLIENT_DEFAULT_RECENT_COUNT).map((client) => client.slug)

const sidebarClientWriteRecent = (ids: string[] | null) => {
  if (!ids) return
  try {
    localStorage.setItem(SIDEBAR_CLIENT_RECENT_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    return
  }
}

const sidebarClientGetDetail = (client: Client) => {
  const kind = SIDEBAR_CLIENT_KIND_LABELS[client.kind]
  if (client.kind === 'individual') return kind
  return `${kind} · ${client.members.length} ${client.members.length === 1 ? 'member' : 'members'}`
}

const sidebarClientToOption = (client: Client, activeId: string | undefined): SidebarClientOption => ({
  id: client.slug,
  name: client.name,
  kind: client.kind,
  initial: client.name.charAt(0).toUpperCase(),
  detail: sidebarClientGetDetail(client),
  active: client.slug === activeId,
})

const sidebarClientSearch = (clients: Client[], query: string, recentIds: string[]) => {
  const needle = query.trim().toLowerCase()
  if (!needle) return recentIds.flatMap((id) => clients.find((client) => client.slug === id) ?? [])
  return clients.filter((client) =>
    client.name.toLowerCase().includes(needle)
    || client.members.some((member) => member.name.toLowerCase().includes(needle))
  )
}

const sidebarClientGetSection = (pathname: string) => {
  const segments = pathname.split('/').filter(Boolean)
  return segments[0] === 'clients' ? segments.slice(2).join('/') : segments.join('/')
}

export function useSidebarClientSwitcher(client: Client | null, member: ClientMember | null, open: boolean, onExpand: () => void) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [storedRecentIds, setRecentIds] = useState(sidebarClientReadRecent)
  const clientsQuery = useApiGetQuery(listClientsApi)

  const clients = clientsQuery.data?.clients
  const defaultRecentIds = sidebarClientGetDefaultRecent(clients ?? [])
  const recentIds = storedRecentIds ?? defaultRecentIds
  const clientId = client?.slug
  const results = sidebarClientSearch(clients ?? [], query, recentIds).map((item) => sidebarClientToOption(item, clientId))

  useEffect(() => {
    if (!clientId || !clients) return
    setRecentIds((ids) => [clientId, ...(ids ?? sidebarClientGetDefaultRecent(clients)).filter((id) => id !== clientId)].slice(0, SIDEBAR_CLIENT_RECENT_LIMIT))
  }, [clientId, clients])

  useEffect(() => sidebarClientWriteRecent(storedRecentIds), [storedRecentIds])

  const closePicker = () => {
    setPickerOpen(false)
    setQuery('')
  }

  const togglePicker = () => {
    if (!open) {
      onExpand()
      return setPickerOpen(true)
    }
    if (pickerOpen) return closePicker()
    setPickerOpen(true)
  }

  const select = (id: string) => {
    closePicker()
    if (id === clientId) return
    const section = sidebarClientGetSection(pathname)
    navigate(section ? `/clients/${id}/${section}` : `/clients/${id}`)
  }

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    closePicker()
    document.getElementById(SIDEBAR_CLIENT_TRIGGER_ID)?.focus()
  }

  const selectFirstOnEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !results[0]) return
    event.preventDefault()
    select(results[0].id)
  }

  const selected = client ? sidebarClientToOption(client, clientId) : null

  return {
    selected,
    eyebrow: selected ? SIDEBAR_CLIENT_KIND_LABELS[selected.kind] : 'Client',
    railLabel: selected ? [selected.name, member?.name].filter(Boolean).join(' · ') : 'Select a client',
    pickerVisible: open && pickerOpen,
    query,
    results,
    heading: query.trim() ? 'Results' : 'Recent',
    setQuery,
    togglePicker,
    select,
    exit: () => navigate('/'),
    closeOnEscape,
    selectFirstOnEnter,
  }
}
