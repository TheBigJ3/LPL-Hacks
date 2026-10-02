import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export { DAY_LABELS, MONTH_LABELS }

export function formatDateLabel(date: Date): string {
  return `${WEEKDAY_SHORT[date.getDay()]}, ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`
}

export function formatDateLabelWithYear(date: Date): string {
  return `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

export function formatTimeLabel(date: Date): string {
  let hours = date.getHours()
  const minutes = date.getMinutes()
  const meridiem = hours >= 12 ? 'pm' : 'am'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes.toString().padStart(2, '0')}${meridiem}`
}

export type CalendarCell = {
  date: Date

  inMonth: boolean
}

export function buildMonthGrid(viewDate: Date): CalendarCell[] {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstOfMonth = new Date(year, month, 1)
  const startOffset = firstOfMonth.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)

  const cells: CalendarCell[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    cells.push({ date, inMonth: date.getMonth() === month })
  }
  return cells
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isDayBefore(day: Date, min: Date): boolean {
  return startOfDay(day).getTime() < startOfDay(min).getTime()
}

export function isDayAfter(day: Date, max: Date): boolean {
  return startOfDay(day).getTime() > startOfDay(max).getTime()
}

export function dateTimeFieldParseTyped(text: string): Date | null {
  const trimmed = text.trim().toLowerCase()
  const numeric = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(trimmed) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed)
  const named = /^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(trimmed)

  let year: number
  let month: number
  let day: number
  if (numeric) {
    month = Number(numeric[1]) - 1
    day = Number(numeric[2])
    year = Number(numeric[3])
  } else if (iso) {
    year = Number(iso[1])
    month = Number(iso[2]) - 1
    day = Number(iso[3])
  } else if (named) {
    month = MONTH_LABELS.findIndex((label) => label.toLowerCase().startsWith(named[1]))
    day = Number(named[2])
    year = Number(named[3])
  } else {
    return null
  }

  const date = new Date(year, month, day)
  if (month < 0 || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

const DATE_TIME_FIELD_SEPARATORS = ['/', '-', '.', ' ']
const DATE_TIME_FIELD_SEGMENT_MAX = [12, 31] as const

export function dateTimeFieldMaskTyped(text: string): string {
  if (/[a-z]/i.test(text) || /^\d{4}-/.test(text)) return text

  const segments: string[] = []
  let pending = ''

  function pushDigit(char: string) {
    if (segments.length === 2) {
      if (pending.length < 4) pending += char
      return
    }

    const max = DATE_TIME_FIELD_SEGMENT_MAX[segments.length]

    if (!pending) {
      if (Number(char) * 10 > max) segments.push(`0${char}`)
      else pending = char
      return
    }

    const combined = pending + char
    if (combined === '00') return

    if (Number(combined) <= max) {
      segments.push(combined)
      pending = ''
      return
    }

    segments.push(pending.padStart(2, '0'))
    pending = ''
    pushDigit(char)
  }

  for (const char of text) {
    if (DATE_TIME_FIELD_SEPARATORS.includes(char)) {
      if (segments.length < 2 && pending && pending !== '0') {
        segments.push(pending.padStart(2, '0'))
        pending = ''
      }
    } else if (/\d/.test(char)) {
      pushDigit(char)
    }
  }

  return [...segments, pending].join('/')
}

export function useDateTimeFieldTyping({
  label,
  onChange,
  setOpen,
  min,
  max,
}: {
  label: string
  onChange: (next: Date) => void
  setOpen: (next: boolean) => void
  min?: Date
  max?: Date
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function type(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const typingAtEnd = event.target.selectionStart === raw.length
    const deleting = (event.nativeEvent as InputEvent).inputType?.startsWith('delete')
    const text = typingAtEnd && !deleting ? dateTimeFieldMaskTyped(raw) : raw
    setDraft(text)
    const parsed = dateTimeFieldParseTyped(text)
    const outOfRange = parsed !== null && ((min !== undefined && isDayBefore(parsed, min)) || (max !== undefined && isDayAfter(parsed, max)))
    if (parsed && !outOfRange) onChange(parsed)
  }

  function focus(event: FocusEvent<HTMLInputElement>) {
    setDraft(label)
    setOpen(true)
    event.currentTarget.select()
  }

  function keyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Tab') setOpen(false)
    if (event.key !== 'Enter') return
    event.preventDefault()
    setOpen(false)
    event.currentTarget.blur()
  }

  return {
    text: draft ?? label,
    type,
    focus,
    keyDown,
    commit: () => setDraft(null),
  }
}

export function isTimeOutOfRange(option: Date, min?: Date, max?: Date): boolean {
  return (min !== undefined && option.getTime() < min.getTime()) || (max !== undefined && option.getTime() > max.getTime())
}

export function eventMergeDate(base: Date, picked: Date): Date {
  const next = new Date(base)
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
  return next
}

export function eventMergeTime(base: Date, picked: Date): Date {
  const next = new Date(base)
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0)
  return next
}

export function buildTimeOptions(base: Date): Date[] {
  const options: Date[] = []
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const d = new Date(base)
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    options.push(d)
  }
  return options
}

export function usePopover<T extends HTMLElement>(): {
  open: boolean
  setOpen: (next: boolean) => void
  containerRef: RefObject<T | null>
} {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<T | null>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, containerRef }
}

export type PopoverPlacement = 'bottom' | 'top'

function popoverVisibleBounds(element: HTMLElement): { top: number; bottom: number } {
  let top = 0
  let bottom = window.innerHeight
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY === 'visible') continue
    const rect = node.getBoundingClientRect()
    top = Math.max(top, rect.top)
    bottom = Math.min(bottom, rect.bottom)
  }
  return { top, bottom }
}

export function usePopoverPlacement<T extends HTMLElement>(
  open: boolean,
  containerRef: RefObject<T | null>,
): PopoverPlacement {
  const [placement, setPlacement] = useState<PopoverPlacement>('bottom')

  useLayoutEffect(() => {
    if (!open) return

    const container = containerRef.current
    const popover = container?.querySelector<HTMLElement>('[data-popover]')
    if (!container || !popover) return

    const anchor = container.getBoundingClientRect()
    const bounds = popoverVisibleBounds(container)
    const needed = popover.offsetHeight + 8
    const roomBelow = bounds.bottom - anchor.bottom >= needed
    const roomAbove = anchor.top - bounds.top >= needed

    setPlacement(!roomBelow && roomAbove ? 'top' : 'bottom')
  }, [open, containerRef])

  return placement
}
