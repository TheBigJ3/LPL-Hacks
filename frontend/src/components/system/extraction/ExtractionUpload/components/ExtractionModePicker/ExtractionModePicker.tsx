import './.css'
import type { ExtractionMode } from '../../.ts'
import { useExtractionModePicker } from './.ts'

type ExtractionModePickerProps = {
  options: { mode: ExtractionMode, icon: string, title: string, hint: string, selected: boolean }[]
  onSelect: (mode: ExtractionMode) => void
}

const ExtractionModePicker = ({ options, onSelect }: ExtractionModePickerProps) => {
  const picker = useExtractionModePicker(options, onSelect)

  return <div role="radiogroup" aria-label="How to add documents" className="extraction-mode-picker grid w-full" onKeyDown={picker.moveOnArrow}>
    {options.map((option) =>
      <button
        key={option.mode}
        type="button"
        role="radio"
        data-mode={option.mode}
        aria-checked={option.selected}
        tabIndex={option.selected ? 0 : -1}
        className="extraction-mode-picker__option flex items-center gap-3 rounded-lg text-left"
        onClick={() => onSelect(option.mode)}
      >
        <span className="material-symbols-outlined extraction-mode-picker__icon grid flex-none place-items-center rounded-md" aria-hidden="true">{option.icon}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="extraction-mode-picker__title">{option.title}</span>
          <span className="extraction-mode-picker__hint">{option.hint}</span>
        </span>
        <span className="extraction-mode-picker__radio grid flex-none place-items-center rounded-full" aria-hidden="true" />
      </button>
    )}
  </div>
}

export default ExtractionModePicker
