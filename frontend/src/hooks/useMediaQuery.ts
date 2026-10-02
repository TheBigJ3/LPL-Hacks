import { useSyncExternalStore } from 'react'

type Source = {
  list: MediaQueryList
  listeners: Set<() => void>
  handler: () => void
}

const sources = new Map<string, Source>()

const getSource = (query: string): Source => {
  const existing = sources.get(query)
  if (existing) return existing

  const list = window.matchMedia(query)
  const source: Source = { list, listeners: new Set(), handler: () => {} }
  source.handler = () => source.listeners.forEach((listener) => listener())

  sources.set(query, source)
  return source
}

const subscribe = (query: string) => (onStoreChange: () => void) => {
  const source = getSource(query)

  if (source.listeners.size === 0) {
    source.list.addEventListener('change', source.handler)
  }
  source.listeners.add(onStoreChange)

  return () => {
    source.listeners.delete(onStoreChange)
    if (source.listeners.size === 0) {
      source.list.removeEventListener('change', source.handler)
      sources.delete(query)
    }
  }
}

const getSnapshot = (query: string) => () => getSource(query).list.matches

export const useMediaQuery = (query: string) =>
  useSyncExternalStore(subscribe(query), getSnapshot(query), () => false)
