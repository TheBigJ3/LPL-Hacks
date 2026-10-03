import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import type { Theme } from '@typings/native/theme'

type ThemeListener = () => void

const THEME_STORAGE_KEY = 'theme:preference'
const THEME_DARK_QUERY = '(prefers-color-scheme: dark)'
const THEME_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const THEME_META_COLORS: Record<Theme, string> = { light: '#FAFAFA', dark: '#09090B' }

const themeReadStored = (): Theme | null => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

const themeWriteStored = (theme: Theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    return
  }
}

const themeApply = (theme: Theme) => {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_META_COLORS[theme])
}

class ThemeLayer {
  private media: MediaQueryList | null = null
  private chosen = false
  private theme: Theme = 'light'
  private listeners = new Set<ThemeListener>()

  init(): void {
    if (this.media) return

    const media = window.matchMedia(THEME_DARK_QUERY)
    const stored = themeReadStored()

    this.media = media
    this.chosen = stored !== null
    media.addEventListener('change', () => {
      if (!this.chosen) this.update(media.matches ? 'dark' : 'light', true)
    })
    this.update(stored ?? (media.matches ? 'dark' : 'light'), false)
  }

  set(theme: Theme): void {
    this.chosen = true
    themeWriteStored(theme)
    this.update(theme, true)
  }

  getSnapshot = (): Theme => this.theme

  subscribe = (listener: ThemeListener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private update(theme: Theme, animate: boolean): void {
    const changed = document.documentElement.dataset.theme !== theme
    const commit = () => {
      if (this.theme !== theme) {
        this.theme = theme
        this.listeners.forEach((listener) => listener())
      }
      if (changed) themeApply(theme)
    }

    if (!changed || !animate || !document.startViewTransition || window.matchMedia(THEME_REDUCED_MOTION_QUERY).matches) return commit()
    document.startViewTransition(() => flushSync(commit))
  }
}

export const themeLayer = new ThemeLayer()

export function themeSet(theme: Theme): void {
  themeLayer.set(theme)
}

export function useTheme(): Theme {
  return useSyncExternalStore(themeLayer.subscribe, themeLayer.getSnapshot)
}
