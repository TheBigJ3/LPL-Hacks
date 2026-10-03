import './.css'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { SIDEBAR_CONTEXT_VARIANTS, useSidebar } from './.ts'
import SidebarHeader from './components/SidebarHeader/SidebarHeader'
import SidebarClientSwitcher from './components/SidebarClientSwitcher/SidebarClientSwitcher'
import SidebarClientMembers from './components/SidebarClientMembers/SidebarClientMembers'
import SidebarGroup from './components/SidebarGroup/SidebarGroup'
import SidebarThemeSwitcher from './components/SidebarThemeSwitcher/SidebarThemeSwitcher'

const Sidebar = () => {
  const sidebar = useSidebar()

  return <MotionConfig reducedMotion="user">
    <div className="sidebar" data-layout={sidebar.layout} data-open={sidebar.open}>
      <div className="sidebar__backdrop" aria-hidden="true" onClick={sidebar.close} />

      <button
        type="button"
        className="sidebar__drawer-trigger"
        aria-label="Open navigation"
        aria-expanded={sidebar.open}
        onClick={sidebar.toggle}
      ><span className="material-symbols-outlined" aria-hidden="true">menu</span></button>

      <nav className="sidebar__panel" aria-label="Main navigation" inert={sidebar.hidden}>
        <SidebarHeader open={sidebar.open} onToggle={sidebar.toggle} />
        <SidebarClientSwitcher client={sidebar.client} member={sidebar.member} open={sidebar.open} onExpand={sidebar.expand} />
        <div className="relative px-3 pb-6">
          <AnimatePresence mode="popLayout" initial={false} custom={sidebar.contextDirection}>
            <motion.div
              key={sidebar.contextKey}
              className="flex flex-col gap-6"
              custom={sidebar.contextDirection}
              variants={SIDEBAR_CONTEXT_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {sidebar.members && <SidebarClientMembers members={sidebar.members} selectedId={sidebar.member?.slug ?? null} open={sidebar.open} />}
              {sidebar.groups.map((group) =>
                <SidebarGroup key={group.label} group={group} open={sidebar.open} onNavigate={sidebar.closeIfFloating} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <SidebarThemeSwitcher open={sidebar.open} />
      </nav>
    </div>
  </MotionConfig>
}

export default Sidebar
