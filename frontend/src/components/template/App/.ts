import { useEffect, type ComponentType } from 'react'
import { useLocation, useNavigation } from 'react-router'
import { splashLayer } from '@stores/splashStore'
import { seoRouteMatch } from '@features/seoRoutes'
import { usePageMeta } from '@hooks/usePageMeta'

type PageModule = { default: ComponentType }

export const lazyPage = (load: () => Promise<PageModule>) => () =>
  load().then((module) => ({ Component: module.default }))

export function useRouteChunkSplash(): void {
  const { state } = useNavigation()
  const loading = state === 'loading'

  useEffect(() => {
    if (!loading || splashLayer.getSnapshot() === 'hidden') return

    return splashLayer.hold({ immediate: true, reason: 'route-chunk' })
  }, [loading])
}

export function useScrollResetOnNavigate(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
}

export function useRoutePageMeta(): void {
  const { pathname } = useLocation()
  const match = seoRouteMatch(pathname)

  usePageMeta(match.kind === 'event' ? null : match.meta)
}
