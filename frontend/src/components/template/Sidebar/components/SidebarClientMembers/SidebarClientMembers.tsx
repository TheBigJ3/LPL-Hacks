import './.css'
import { motion } from 'motion/react'
import type { ClientMember } from '@lpl-hacks/shared/src/types/native/clients/client'
import { SIDEBAR_SWAP_TRANSITION, SIDEBAR_TAB_VARIANTS } from '../../.ts'
import { SIDEBAR_CLIENT_MEMBERS_HIGHLIGHT_ID, useSidebarClientMembers } from './.ts'

type SidebarClientMembersProps = {
  members: ClientMember[]
  selectedId: string | null
  open: boolean
}

const SidebarClientMembers = ({ members, selectedId, open }: SidebarClientMembersProps) => {
  const scope = useSidebarClientMembers(members, selectedId)

  return <motion.section className="sidebar-client-members flex flex-col gap-2" data-open={open} aria-label="Household members" variants={SIDEBAR_TAB_VARIANTS}>
    <h2 className="sidebar-client-members__label">Viewing</h2>
    <div className="flex flex-wrap gap-1.5 px-1" role="radiogroup" aria-label="Household member">
      {scope.options.map((option) =>
        <button
          key={option.id ?? 'all'}
          type="button"
          role="radio"
          aria-checked={option.selected}
          className="sidebar-client-members__chip relative h-7 rounded-full px-3"
          data-selected={option.selected}
          onClick={() => scope.select(option.id)}
        >
          {option.selected &&
            <motion.span
              layoutId={SIDEBAR_CLIENT_MEMBERS_HIGHLIGHT_ID}
              className="sidebar-client-members__highlight absolute rounded-full"
              transition={SIDEBAR_SWAP_TRANSITION}
            />}
          <span className="relative">{option.label}</span>
        </button>
      )}
    </div>
  </motion.section>
}

export default SidebarClientMembers
