import { useEffect, useState, useSyncExternalStore } from 'react'

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
      { label: 'Households', icon: 'groups', path: '/', end: true },
      { label: 'Documents', icon: 'description', path: '/documents' },
      { label: 'Review queue', icon: 'fact_check', path: '/review' },
    ],
  },
  {
    label: 'Tools',
    tabs: [
      { label: 'Upload', icon: 'upload_file', path: '/upload' },
      { label: 'Assistant', icon: 'auto_awesome', path: '/assistant' },
    ],
  },
]

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
    groups: SIDEBAR_GROUPS,
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    closeIfFloating: () => setFloatingOpen(false),
  }
}
