import { useSearchParams } from 'react-router'
import type { ClientMember } from '@lpl-hacks/shared/src/types/native/clients/client'
import { SIDEBAR_CLIENT_MEMBER_PARAM } from '../../.ts'

export const SIDEBAR_CLIENT_MEMBERS_HIGHLIGHT_ID = 'sidebar-client-members-highlight'

export function useSidebarClientMembers(members: ClientMember[], selectedId: string | null) {
  const [, setSearchParams] = useSearchParams()

  const select = (memberId: string | null) => {
    if (memberId === selectedId) return
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      if (memberId) next.set(SIDEBAR_CLIENT_MEMBER_PARAM, memberId)
      else next.delete(SIDEBAR_CLIENT_MEMBER_PARAM)
      return next
    })
  }

  return {
    options: [
      { id: null, label: 'All members', selected: selectedId === null },
      ...members.map((member) => ({ id: member.slug, label: member.name, selected: member.slug === selectedId })),
    ],
    select,
  }
}
