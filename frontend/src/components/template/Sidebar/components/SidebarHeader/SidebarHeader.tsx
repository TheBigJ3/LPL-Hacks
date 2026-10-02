import './.css'
import { Link } from 'react-router'
import lplLogo from '@assets/logos/lpl-financial-logo.svg'
import lplLogoCondensed from '@assets/logos/lpl-logo-condensed.svg'

const SidebarHeader = ({ open, onToggle }: { open: boolean; onToggle: () => void }) =>
  <div className="sidebar-header flex h-16 flex-none items-center justify-between" data-open={open}>
    {open
      ? <>
        <Link to="/" className="sidebar-header__logo" aria-label="LPL Financial home"><img src={lplLogo} alt="" /></Link>
        <button type="button" className="sidebar-header__button" aria-label="Collapse navigation" aria-expanded={open} onClick={onToggle}>
          <span className="material-symbols-outlined" aria-hidden="true">left_panel_close</span>
        </button>
      </>
      : <button type="button" className="sidebar-header__button sidebar-header__expand" aria-label="Expand navigation" aria-expanded={open} onClick={onToggle}>
        <img src={lplLogoCondensed} alt="" className="sidebar-header__mark" />
        <span className="material-symbols-outlined sidebar-header__expand-icon" aria-hidden="true">left_panel_open</span>
      </button>}
  </div>

export default SidebarHeader
