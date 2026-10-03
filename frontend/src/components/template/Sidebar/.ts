import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMatch, useSearchParams } from 'react-router'
import type { Transition, Variants } from 'motion/react'
import type { Client, ClientMember } from '@lpl-hacks/shared/src/types/native/clients/client'
import listClientsApi from '@api/clients/listClientsApi'
import { useApiGetQuery } from '@features/apiLayer'

export type SidebarLayout = 'docked' | 'rail' | 'drawer'

export type SidebarTab = {
  label: string
  icon: string
  path: string
  end?: boolean
}

export type SidebarTabGroup = {
  label: string
  tabs: SidebarTab[]
}

export const SIDEBAR_GROUPS: SidebarTabGroup[] = [
  {
    label: 'Workspace',
    tabs: [
      { label: 'Clients', icon: 'groups', path: '/', end: true },
      { label: 'Documents', icon: 'description', path: '/documents' },
      { label: 'Notes', icon: 'sticky_note_2', path: '/notes' },
      { label: 'Review queue', icon: 'fact_check', path: '/review' },
    ],
  },
  {
    label: 'Tools',
    tabs: [
      { label: 'Upload', icon: 'upload_file', path: '/upload' },
      { label: 'Extract', icon: 'document_scanner', path: '/extract' },
      { label: 'Assistant', icon: 'auto_awesome', path: '/assistant' },
    ],
  },
]

export const SIDEBAR_CLIENT_MEMBER_PARAM = 'member'

const SIDEBAR_EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const
const SIDEBAR_CONTEXT_SHIFT = 40

export const SIDEBAR_CONTEXT_VARIANTS: Variants = {
  enter: (direction: number) => ({ x: direction * SIDEBAR_CONTEXT_SHIFT, opacity: 0 }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.32, ease: SIDEBAR_EASE_OUT_EXPO, staggerChildren: 0.04, delayChildren: 0.06 },
  },
  exit: (direction: number) => ({
    x: direction * -SIDEBAR_CONTEXT_SHIFT,
    opacity: 0,
    transition: { duration: 0.18, ease: 'easeIn' },
  }),
}

export const SIDEBAR_TAB_VARIANTS: Variants = {
  enter: { opacity: 0, y: 6 },
  center: { opacity: 1, y: 0, transition: { duration: 0.24, ease: SIDEBAR_EASE_OUT_EXPO } },
}

export const SIDEBAR_SWAP_TRANSITION: Transition = { duration: 0.28, ease: SIDEBAR_EASE_OUT_EXPO }

const sidebarClientGetGroups = (client: Client, member: ClientMember | null): SidebarTabGroup[] => {
  const base = `/clients/${client.slug}`
  const search = member ? `?${SIDEBAR_CLIENT_MEMBER_PARAM}=${member.slug}` : ''
  return [
    {
      label: 'Client',
      tabs: [
        { label: 'Overview', icon: 'space_dashboard', path: `${base}${search}`, end: true },
        { label: 'Documents', icon: 'description', path: `${base}/documents${search}` },
        { label: 'Notes', icon: 'sticky_note_2', path: `${base}/notes${search}` },
        { label: 'Review queue', icon: 'fact_check', path: `${base}/review${search}` },
      ],
    },
    {
      label: 'Tools',
      tabs: [
        { label: 'Upload', icon: 'upload_file', path: `${base}/upload${search}` },
        { label: 'Extract', icon: 'document_scanner', path: `${base}/extract${search}` },
        { label: 'Assistant', icon: 'auto_awesome', path: `${base}/assistant${search}` },
      ],
    },
  ]
}

const SIDEBAR_DOCKED_QUERY = '(min-width: 1024px)'
const SIDEBAR_RAIL_QUERY = '(min-width: 640px)'
const SIDEBAR_DOCKED_OPEN_STORAGE_KEY = 'sidebar:docked-open'

const sidebarSubscribeLayout = (onChange: () => void) => {
  const queries = [window.matchMedia(SIDEBAR_DOCKED_QUERY), window.matchMedia(SIDEBAR_RAIL_QUERY)]
  queries.forEach((query) => query.addEventListener('change', onChange))
  return () => queries.forEach((query) => query.removeEventListener('change', onChange))
}

const sidebarGetLayout = (): SidebarLayout => {
  if (window.matchMedia(SIDEBAR_DOCKED_QUERY).matches) return 'docked'
  if (window.matchMedia(SIDEBAR_RAIL_QUERY).matches) return 'rail'
  return 'drawer'
}

const sidebarReadDockedOpen = () => {
  try {
    return localStorage.getItem(SIDEBAR_DOCKED_OPEN_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

const sidebarWriteDockedOpen = (open: boolean) => {
  try {
    localStorage.setItem(SIDEBAR_DOCKED_OPEN_STORAGE_KEY, String(open))
  } catch {
    return
  }
}

export function useSidebar() {
  const layout = useSyncExternalStore(sidebarSubscribeLayout, sidebarGetLayout)
  const [dockedOpen, setDockedOpen] = useState(sidebarReadDockedOpen)
  const [floatingOpen, setFloatingOpen] = useState(false)
  const clientMatch = useMatch('/clients/:clientId/*')
  const [searchParams] = useSearchParams()

  const clientsQuery = useApiGetQuery(listClientsApi)

  const client = clientsQuery.data?.clients.find((item) => item.slug === clientMatch?.params.clientId) ?? null
  const memberSlug = searchParams.get(SIDEBAR_CLIENT_MEMBER_PARAM)
  const member = client?.members.find((item) => item.slug === memberSlug) ?? null

  const docked = layout === 'docked'
  const open = docked ? dockedOpen : floatingOpen

  const setOpen = (next: boolean) => {
    if (!docked) return setFloatingOpen(next)
    setDockedOpen(next)
    sidebarWriteDockedOpen(next)
  }

  useEffect(() => {
    if (docked || !floatingOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFloatingOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [docked, floatingOpen])

  return {
    layout,
    open,
    hidden: layout === 'drawer' && !open,
    client,
    member,
    members: client?.kind === 'household' ? client.members : null,
    groups: client ? sidebarClientGetGroups(client, member) : SIDEBAR_GROUPS,
    contextKey: client?.slug ?? 'workspace',
    contextDirection: client ? 1 : -1,
    toggle: () => setOpen(!open),
    expand: () => setOpen(true),
    close: () => setOpen(false),
    closeIfFloating: () => setFloatingOpen(false),
  }
}
