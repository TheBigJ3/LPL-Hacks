import { useCallback, useRef, useState } from 'react'

export const useElementWidth = <T extends HTMLElement>(): [
  (node: T | null) => void,
  number,
] => {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null

    if (!node) return

    setWidth(node.offsetWidth)

    observer.current = new ResizeObserver(([entry]) => {
      const borderBox = entry.borderBoxSize[0] as ResizeObserverSize | undefined
      setWidth(borderBox ? borderBox.inlineSize : entry.contentRect.width)
    })
    observer.current.observe(node)
  }, [])

  return [ref, width]
}
