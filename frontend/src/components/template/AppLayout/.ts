import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'

export const APP_LAYOUT_CONTENT_ID = 'app-layout-content'

export function useAppLayout() {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return { mainRef }
}
