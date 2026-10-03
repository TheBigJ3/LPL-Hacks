import type { KeyboardEvent } from 'react'
import type { ExtractionMode } from '../../.ts'

const EXTRACTION_MODE_PICKER_KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']

export function useExtractionModePicker(options: { mode: ExtractionMode, selected: boolean }[], onSelect: (mode: ExtractionMode) => void) {
  const moveOnArrow = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!EXTRACTION_MODE_PICKER_KEYS.includes(event.key)) return
    event.preventDefault()
    const current = options.findIndex((option) => option.selected)
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const next = options[(current + step + options.length) % options.length]!
    onSelect(next.mode)
    event.currentTarget.querySelector<HTMLElement>(`[data-mode="${next.mode}"]`)?.focus()
  }

  return { moveOnArrow }
}
