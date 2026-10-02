import { themeSet, useTheme } from '@stores/themeStore'
import type { Theme } from '@typings/native/theme'

type SidebarThemeOption = {
  value: Theme
  label: string
  icon: string
}

export const SIDEBAR_THEME_HIGHLIGHT_ID = 'sidebar-theme-highlight'

const SIDEBAR_THEME_OPTIONS: SidebarThemeOption[] = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
]

export function useSidebarThemeSwitcher() {
  const theme = useTheme()
  const current = SIDEBAR_THEME_OPTIONS.find((option) => option.value === theme) ?? SIDEBAR_THEME_OPTIONS[0]
  const next = SIDEBAR_THEME_OPTIONS.find((option) => option.value !== theme) ?? SIDEBAR_THEME_OPTIONS[1]

  return {
    options: SIDEBAR_THEME_OPTIONS.map((option) => ({ ...option, selected: option.value === theme })),
    current,
    toggleLabel: `Switch to ${next.label.toLowerCase()} mode`,
    select: themeSet,
    toggle: () => themeSet(next.value),
  }
}
