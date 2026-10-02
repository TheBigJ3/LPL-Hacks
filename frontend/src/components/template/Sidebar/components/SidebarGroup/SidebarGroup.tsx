import './.css'
import type { SidebarTabGroup } from '../../.ts'
import SidebarTab from './components/SidebarTab/SidebarTab'

const SidebarGroup = ({ group, open, onNavigate }: { group: SidebarTabGroup; open: boolean; onNavigate: () => void }) =>
  <section className="sidebar-group flex flex-col gap-1" data-open={open} aria-label={group.label}>
    <h2 className="sidebar-group__label">{group.label}</h2>
    <ul className="flex flex-col gap-1">
      {group.tabs.map((tab) => <li key={tab.path}><SidebarTab tab={tab} open={open} onNavigate={onNavigate} /></li>)}
    </ul>
  </section>

export default SidebarGroup
