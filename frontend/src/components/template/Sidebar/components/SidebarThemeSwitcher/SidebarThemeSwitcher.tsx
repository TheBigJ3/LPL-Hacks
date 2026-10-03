import './.css'
import { useSidebarThemeSwitcher } from './.ts'

const SidebarThemeSwitcher = ({ open }: { open: boolean }) => {
  const theme = useSidebarThemeSwitcher()

  return <div className="sidebar-theme-switcher mt-auto px-3 pb-4">
    {open
      ? <div className="sidebar-theme-switcher__track flex rounded-lg p-1" role="radiogroup" aria-label="Theme">
        {theme.options.map((option) =>
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.selected}
            className="sidebar-theme-switcher__option relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md"
            data-selected={option.selected}
            onClick={() => theme.select(option.value)}
          >
            {option.selected && <span className="sidebar-theme-switcher__highlight absolute inset-0 rounded-md" />}
            <span className="material-symbols-outlined sidebar-theme-switcher__icon relative" aria-hidden="true">{option.icon}</span>
            <span className="relative">{option.label}</span>
          </button>
        )}
      </div>
      : <button
        type="button"
        className="sidebar-theme-switcher__toggle grid h-10 w-10 place-items-center rounded-md"
        aria-label={theme.toggleLabel}
        title={theme.toggleLabel}
        onClick={theme.toggle}
      ><span className="material-symbols-outlined sidebar-theme-switcher__icon" aria-hidden="true">{theme.current.icon}</span></button>}
  </div>
}

export default SidebarThemeSwitcher
