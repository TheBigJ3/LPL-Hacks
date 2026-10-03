import './.css'
import { NavLink } from 'react-router'
import type { SidebarTab as SidebarTabData } from '../../../../.ts'

const SidebarTab = ({ tab, open, onNavigate }: { tab: SidebarTabData; open: boolean; onNavigate: () => void }) =>
  <NavLink
    to={tab.path}
    end={tab.end}
    className="sidebar-tab flex h-10 items-center gap-3 rounded-md px-2.5"
    data-open={open}
    title={open ? undefined : tab.label}
    onClick={onNavigate}
  >
    <span className="material-symbols-outlined sidebar-tab__icon flex-none" aria-hidden="true">{tab.icon}</span>
    <span className="sidebar-tab__label min-w-0 text-h5">{tab.label}</span>
  </NavLink>

export default SidebarTab
