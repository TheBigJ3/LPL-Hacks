import './.css'
import { useSidebar } from './.ts'
import SidebarHeader from './components/SidebarHeader/SidebarHeader'
import SidebarGroup from './components/SidebarGroup/SidebarGroup'

const Sidebar = () => {
  const sidebar = useSidebar()

  return <div className="sidebar" data-layout={sidebar.layout} data-open={sidebar.open}>
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
      <div className="flex flex-col gap-6 px-3 pb-6">
        {sidebar.groups.map((group) =>
          <SidebarGroup key={group.label} group={group} open={sidebar.open} onNavigate={sidebar.closeIfFloating} />
        )}
      </div>
    </nav>
  </div>
}

export default Sidebar
