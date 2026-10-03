import './.css'
import type { FormEvent } from 'react'
import { EXTRACTION_EDITOR_DOM_ID, EXTRACTION_INPUT_DOM_ID, type ExtractionEditValue, type ExtractionSelectedView, type ExtractionStepperView } from '../../../../.ts'

type ExtractionReviewEditorProps = {
  selected: ExtractionSelectedView
  stepper: ExtractionStepperView
  onPick: (id: string) => void
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  onChange: (value: ExtractionEditValue) => void
  onSubmit: (event: FormEvent) => void
  onUndo: () => void
}

const ExtractionReviewEditor = ({ selected, stepper, onPick, onPrev, onNext, onSkip, onChange, onSubmit, onUndo }: ExtractionReviewEditorProps) =>
  <form id={EXTRACTION_EDITOR_DOM_ID} className="extraction-review-editor flex min-h-0 flex-1 flex-col" data-status={selected.status} aria-label={selected.label} onSubmit={onSubmit}>
    <div className="extraction-review-editor__stepper flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="extraction-review-editor__arrow grid place-items-center rounded-md" aria-label="Previous flagged field" disabled={!stepper.canPrev} onClick={onPrev}>
          <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
        </button>
        <span className="extraction-review-editor__position">{stepper.label}</span>
        <button type="button" className="extraction-review-editor__arrow grid place-items-center rounded-md" aria-label="Next flagged field" disabled={!stepper.canNext} onClick={onNext}>
          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>
      </div>
      {stepper.steps.length > 1 &&
        <ol className="flex gap-1" aria-label="Flagged fields">
          {stepper.steps.map((step) =>
            <li key={step.id} className="flex-1">
              <button
                type="button"
                className="extraction-review-editor__segment block w-full rounded-full"
                data-status={step.status}
                data-selected={step.selected}
                aria-label={step.label}
                aria-current={step.selected ? 'step' : undefined}
                onClick={() => onPick(step.id)}
              />
            </li>
          )}
        </ol>}
    </div>

    <div className="extraction-review-editor__body flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
      <header className="flex items-start justify-between gap-3">
        <h2 className="extraction-review-editor__label">{selected.label}</h2>
        <span className="extraction-review-editor__badge flex flex-none items-center gap-1 rounded-full py-0.5 pr-2.5 pl-2" data-status={selected.status}>
          <span className="material-symbols-outlined" aria-hidden="true">{selected.statusIcon}</span>
          {selected.statusLabel}
        </span>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="extraction-review-editor__step flex items-center gap-2">
          <span className="extraction-review-editor__number grid place-items-center rounded-full">1</span>
          Where it is
          <span className="extraction-review-editor__page ml-auto">{selected.pageLabel}</span>
        </h3>
        {selected.crop &&
          <div style={selected.crop.frameStyle} className="extraction-review-editor__crop relative w-full overflow-hidden rounded-md">
            <img src={selected.crop.imageUrl} alt={`${selected.label} on the document`} draggable={false} style={selected.crop.imageStyle} className="absolute max-w-none select-none" />
            <div style={selected.crop.markerStyle} className="extraction-review-editor__marker absolute rounded-sm" />
          </div>}
        {selected.locationNote && <p className="extraction-review-editor__note rounded-md px-3 py-2">{selected.locationNote}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="extraction-review-editor__step flex items-center gap-2">
          <span className="extraction-review-editor__number grid place-items-center rounded-full">2</span>
          What we read
          <span className="extraction-review-editor__confidence ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" data-level={selected.confidenceLevel} title="How sure the scanner is that it read this correctly">
            <span className="extraction-review-editor__dot size-1.5 rounded-full" />
            {selected.confidenceLabel} · {selected.confidencePercent}
          </span>
        </h3>
        <p className="extraction-review-editor__read rounded-md px-3 py-2.5" data-missing={selected.readAsMissing}>{selected.readAs}</p>
        {selected.normalizedLabel && <p className="extraction-review-editor__hint">Saved as <span className="extraction-review-editor__mono">{selected.normalizedLabel}</span></p>}
        {selected.issues.length > 0 &&
          <ul className="extraction-review-editor__issues flex flex-col gap-1 rounded-md px-3 py-2" aria-label="Why it's flagged">
            {selected.issues.map((issue, index) =>
              <li key={index} className="flex items-start gap-1.5">
                <span className="material-symbols-outlined" aria-hidden="true">info</span>
                {issue}
              </li>
            )}
          </ul>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="extraction-review-editor__step flex items-center gap-2">
          <span className="extraction-review-editor__number grid place-items-center rounded-full">3</span>
          Is this right?
        </h3>
        <p className="extraction-review-editor__guidance">{selected.guidance}</p>
        {selected.kind === 'checkbox'
          ? <div className="extraction-review-editor__choice grid grid-cols-2 gap-1 rounded-lg p-1" role="radiogroup" aria-label={selected.label}>
            <button id={EXTRACTION_INPUT_DOM_ID} type="button" role="radio" aria-checked={selected.checked} className="extraction-review-editor__option flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5" onClick={() => onChange(true)}>
              <span className="material-symbols-outlined" aria-hidden="true">check_box</span>
              Checked
            </button>
            <button type="button" role="radio" aria-checked={!selected.checked} className="extraction-review-editor__option flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5" onClick={() => onChange(false)}>
              <span className="material-symbols-outlined" aria-hidden="true">check_box_outline_blank</span>
              Unchecked
            </button>
          </div>
          : <input
            id={EXTRACTION_INPUT_DOM_ID}
            type="text"
            className="extraction-review-editor__input w-full rounded-lg px-3 py-2.5"
            aria-label={`Value for ${selected.label}`}
            placeholder="Type the value shown on the document"
            autoComplete="off"
            value={selected.text}
            data-changed={selected.changed}
            onChange={(event) => onChange(event.target.value)}
          />}
        {selected.changed && <p className="extraction-review-editor__hint">Correcting <span className="extraction-review-editor__mono extraction-review-editor__struck">{selected.readAs}</span></p>}
      </section>
    </div>

    <footer className="extraction-review-editor__footer flex flex-wrap items-center gap-2 p-3">
      {selected.canUndo &&
        <button type="button" className="extraction-review-editor__secondary flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2" onClick={onUndo}>
          <span className="material-symbols-outlined" aria-hidden="true">undo</span>
          Undo
        </button>}
      {selected.canSkip &&
        <button type="button" className="extraction-review-editor__secondary flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2" onClick={onSkip}>
          Skip for now
        </button>}
      <button type="submit" className="extraction-review-editor__primary flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2" data-intent={selected.changed ? 'correct' : 'confirm'}>
        <span className="material-symbols-outlined" aria-hidden="true">{selected.submitIcon}</span>
        {selected.submitLabel}
        {selected.kind === 'text' && <kbd className="extraction-review-editor__kbd rounded-sm px-1">↵</kbd>}
      </button>
    </footer>
  </form>

export default ExtractionReviewEditor
