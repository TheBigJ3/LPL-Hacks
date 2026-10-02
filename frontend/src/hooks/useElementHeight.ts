import { useCallback, useRef, useState } from 'react'

export const useElementHeight = <T extends HTMLElement>(): [
  (node: T | null) => void,
  number,
] => {
  const [height, setHeight] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null

    if (!node) return

    setHeight(node.offsetHeight)

    observer.current = new ResizeObserver(([entry]) => {
      const borderBox = entry.borderBoxSize[0] as ResizeObserverSize | undefined
      setHeight(borderBox ? borderBox.blockSize : entry.contentRect.height)
    })
    observer.current.observe(node)
  }, [])

  return [ref, height]
}
