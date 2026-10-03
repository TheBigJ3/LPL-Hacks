import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useElementWidth } from '@hooks/useElementWidth'

const DOCUMENT_TAG_FILTER_LABEL_SPEED = 40
const DOCUMENT_TAG_FILTER_LABEL_TRAVEL_SHARE = 0.6
const DOCUMENT_TAG_FILTER_LABEL_MIN_DURATION = 1.6

export function useDocumentTagFilterLabel(label: string) {
  const [containerRef, width] = useElementWidth<HTMLSpanElement>()
  const textRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const measure = () => {
      if (textRef.current && width) setShift(Math.max(0, Math.ceil(textRef.current.scrollWidth - width)))
    }
    measure()
    // The label can be measured in the fallback font before the web font swaps in.
    document.fonts.addEventListener('loadingdone', measure)
    return () => document.fonts.removeEventListener('loadingdone', measure)
  }, [label, width])

  const duration = Math.max(DOCUMENT_TAG_FILTER_LABEL_MIN_DURATION, shift / DOCUMENT_TAG_FILTER_LABEL_SPEED / DOCUMENT_TAG_FILTER_LABEL_TRAVEL_SHARE)

  return {
    containerRef,
    textRef,
    overflowing: shift > 1,
    style: {
      '--document-tag-filter-label-shift': `-${shift}px`,
      '--document-tag-filter-label-duration': `${duration}s`,
    } as CSSProperties,
  }
}
