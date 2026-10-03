import './.css'
import { AnimatePresence, motion } from 'motion/react'
import type { Client, ClientMember } from '@lpl-hacks/shared/src/types/native/clients/client'
import {
  SIDEBAR_CLIENT_PICKER_ID,
  SIDEBAR_CLIENT_PICKER_VARIANTS,
  SIDEBAR_CLIENT_SWAP_VARIANTS,
  SIDEBAR_CLIENT_TRIGGER_ID,
  useSidebarClientSwitcher,
} from './.ts'
import SidebarClientPicker from './components/SidebarClientPicker/SidebarClientPicker'

type SidebarClientSwitcherProps = {
  client: Client | null
  member: ClientMember | null
  open: boolean
  onExpand: () => void
}

const SidebarClientSwitcher = ({ client, member, open, onExpand }: SidebarClientSwitcherProps) => {
  const switcher = useSidebarClientSwitcher(client, member, open, onExpand)

  return <div className="sidebar-client-switcher px-3 pb-4" data-open={open} data-active={!!switcher.selected}>
    <div className="sidebar-client-switcher__card flex items-center rounded-lg">
      <button
        id={SIDEBAR_CLIENT_TRIGGER_ID}
        type="button"
        className="sidebar-client-switcher__trigger flex min-w-0 flex-1 items-center gap-3 rounded-lg"
        aria-label={open ? undefined : switcher.railLabel}
        aria-expanded={switcher.pickerVisible}
        aria-controls={SIDEBAR_CLIENT_PICKER_ID}
        title={open ? undefined : switcher.railLabel}
        onClick={switcher.togglePicker}
      >
        <span className="sidebar-client-switcher__avatar-slot grid flex-none">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={switcher.selected?.id ?? 'none'}
              className="sidebar-client-switcher__avatar grid place-items-center"
              data-kind={switcher.selected?.kind}
              variants={SIDEBAR_CLIENT_SWAP_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {switcher.selected
                ? switcher.selected.initial
                : <span className="material-symbols-outlined" aria-hidden="true">person_search</span>}
            </motion.span>
          </AnimatePresence>
        </span>

        <span className="sidebar-client-switcher__text relative flex min-w-0 flex-1 flex-col text-left">
          <span className="sidebar-client-switcher__eyebrow truncate">{switcher.eyebrow}</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={switcher.selected?.id ?? 'none'}
              className="sidebar-client-switcher__name truncate"
              variants={SIDEBAR_CLIENT_SWAP_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
            >{switcher.selected?.name ?? 'Select a client'}</motion.span>
          </AnimatePresence>
        </span>

        <span className="material-symbols-outlined sidebar-client-switcher__chevron flex-none" aria-hidden="true">unfold_more</span>
      </button>

      {switcher.selected &&
        <button type="button" className="sidebar-client-switcher__exit" aria-label="Leave client view" title="Leave client view" onClick={switcher.exit}>
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>}
    </div>

    <AnimatePresence initial={false}>
      {switcher.pickerVisible &&
        <motion.div
          id={SIDEBAR_CLIENT_PICKER_ID}
          className="overflow-hidden"
          variants={SIDEBAR_CLIENT_PICKER_VARIANTS}
          initial="closed"
          animate="open"
          exit="closed"
        >
          <SidebarClientPicker
            query={switcher.query}
            heading={switcher.heading}
            results={switcher.results}
            onQueryChange={switcher.setQuery}
            onSelect={switcher.select}
            onEscape={switcher.closeOnEscape}
            onSearchKeyDown={switcher.selectFirstOnEnter}
          />
        </motion.div>}
    </AnimatePresence>
  </div>
}

export default SidebarClientSwitcher
