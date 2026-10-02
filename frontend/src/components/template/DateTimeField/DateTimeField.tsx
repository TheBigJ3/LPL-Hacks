import { useLayoutEffect, useRef, useState } from 'react'
import {
  DAY_LABELS,
  MONTH_LABELS,
  buildMonthGrid,
  buildTimeOptions,
  formatDateLabel,
  formatDateLabelWithYear,
  formatTimeLabel,
  isDayAfter,
  isDayBefore,
  isSameDay,
  isTimeOutOfRange,
  useDateTimeFieldTyping,
  usePopover,
  usePopoverPlacement,
} from './.ts'
import './.css'

type DateTimeFieldProps = {
  mode: 'date' | 'time'
  value: Date
  onChange: (next: Date) => void

  side: 'left' | 'right'
  ariaLabel: string

  min?: Date
  max?: Date

  withYear?: boolean
  typeable?: boolean
  empty?: boolean
}

function CalendarPopover({
  value,
  onChange,
  min,
  max,
  empty,
}: {
  value: Date
  onChange: (d: Date) => void
  min?: Date
  max?: Date
  empty: boolean
}) {
  const [viewDate, setViewDate] = useState(new Date(value.getFullYear(), value.getMonth(), 1))
  const cells = buildMonthGrid(viewDate)

  const shiftMonth = (delta: number) =>
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))

  return (
    <div className='date-time-field__calendar'>
      <div className='mb-[8px] flex items-center justify-between'>
        <button
          type='button'
          aria-label='Previous month'
          onClick={() => shiftMonth(-1)}
          className='flex size-[28px] items-center justify-center rounded-[8px] hover:bg-white/10'
        >
          <span className='material-symbols-outlined text-[18px] text-main-white' translate='no' aria-hidden='true'>
            chevron_left
          </span>
        </button>
        <span className='font-[Arimo] text-[14px] font-bold text-main-white'>
          {MONTH_LABELS[viewDate.getMonth()]} {viewDate.getFullYear()}
        </span>
        <button
          type='button'
          aria-label='Next month'
          onClick={() => shiftMonth(1)}
          className='flex size-[28px] items-center justify-center rounded-[8px] hover:bg-white/10'
        >
          <span className='material-symbols-outlined text-[18px] text-main-white' translate='no' aria-hidden='true'>
            chevron_right
          </span>
        </button>
      </div>

      <div className='date-time-field__weekdays'>
        {DAY_LABELS.map((day, i) => (
          <span
            key={i}
            className='flex items-center justify-center py-[4px] font-[Arimo] text-[12px] text-paragraph-off-white'
          >
            {day}
          </span>
        ))}
      </div>

      <div className='date-time-field__days'>
        {cells.map((cell) => {
          const disabled = (min !== undefined && isDayBefore(cell.date, min)) || (max !== undefined && isDayAfter(cell.date, max))
          return (
            <button
              key={cell.date.toISOString()}
              type='button'
              className='date-time-field__day'
              aria-label={formatDateLabelWithYear(cell.date)}
              aria-pressed={!empty && isSameDay(cell.date, value)}
              data-outside={!cell.inMonth}
              data-selected={!empty && isSameDay(cell.date, value)}
              disabled={disabled}
              onClick={() => onChange(cell.date)}
            >
              {cell.date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimePopover({
  value,
  onChange,
  min,
  max,
}: {
  value: Date
  onChange: (d: Date) => void
  min?: Date
  max?: Date
}) {
  const options = buildTimeOptions(value)
  const listRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    const selected = list?.querySelector<HTMLElement>('[data-selected="true"]')
    if (!list || !selected) return
    list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2
  }, [])

  return (

    <div ref={listRef} className='date-time-field__times overscroll-contain'>
      {options.map((option) => {
        const selected =
          option.getHours() === value.getHours() && option.getMinutes() === value.getMinutes()
        const disabled = isTimeOutOfRange(option, min, max)
        return (
          <button
            key={option.toISOString()}
            type='button'
            className='date-time-field__time'
            aria-pressed={selected}
            data-selected={selected}
            disabled={disabled}
            onClick={() => onChange(option)}
          >
            {formatTimeLabel(option)}
          </button>
        )
      })}
    </div>
  )
}

export default function DateTimeField({
  mode,
  value,
  onChange,
  side,
  ariaLabel,
  min,
  max,
  withYear = false,
  typeable = false,
  empty = false,
}: DateTimeFieldProps) {
  const { open, setOpen, containerRef } = usePopover<HTMLDivElement>()
  const placement = usePopoverPlacement(open, containerRef)

  const label =
    mode === 'date'
      ? withYear
        ? formatDateLabelWithYear(value)
        : formatDateLabel(value)
      : formatTimeLabel(value)
  const typing = useDateTimeFieldTyping({ label: empty ? '' : label, onChange, setOpen, min, max })
  const radius = side === 'left' ? 'rounded-l-[6px]' : 'rounded-r-[6px]'
  const weight = mode === 'date' ? 'font-bold' : 'font-normal'

  const handleSelect = (next: Date) => {
    onChange(next)

    setOpen(false)
  }

  return (
    <div ref={containerRef} className='date-time-field' data-placement={placement} data-side={side}>
      {typeable && mode === 'date' ? (
        <input
          type='text'
          inputMode='numeric'
          autoComplete='off'
          placeholder='MM/DD/YYYY'
          aria-label={ariaLabel}
          aria-expanded={open}
          value={typing.text}
          onChange={typing.type}
          onFocus={typing.focus}
          onBlur={typing.commit}
          onKeyDown={typing.keyDown}
          onClick={() => setOpen(true)}
          className={`w-full min-w-0 bg-white/10 px-[24px] py-[12px] text-left font-[Arimo] text-[14px] tracking-[-0.28px] text-main-white outline-none placeholder:text-paragraph-off-white ${weight} ${radius}`}
        />
      ) : (
        <button
          type='button'
          aria-label={ariaLabel}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`flex items-center justify-center bg-white/10 px-[24px] py-[12px] ${radius}`}
        >
          <span className={`font-[Arimo] text-[14px] tracking-[-0.28px] text-main-white ${weight}`}>
            {label}
          </span>
        </button>
      )}

      {open && (
        <div className='date-time-field__popover' data-popover role='dialog' aria-label={ariaLabel}>
          {mode === 'date' ? (
            <CalendarPopover key={`${value.getFullYear()}-${value.getMonth()}`} value={value} onChange={handleSelect} min={min} max={max} empty={empty} />
          ) : (
            <TimePopover value={value} onChange={handleSelect} min={min} max={max} />
          )}
        </div>
      )}
    </div>
  )
}
