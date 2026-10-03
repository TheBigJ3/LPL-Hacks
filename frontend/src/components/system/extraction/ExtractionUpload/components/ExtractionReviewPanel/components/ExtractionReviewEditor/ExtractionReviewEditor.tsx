import './.css'
import { EXTRACTION_EDITOR_DOM_ID, type ExtractionEditValue, type ExtractionSelectedView } from '../../../../.ts'

const ExtractionReviewEditor = ({ selected, onEdit, onConfirm, onUnconfirm, onRevert, onNext }: {
  selected: ExtractionSelectedView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onConfirm: (id: string) => void
  onUnconfirm: (id: string) => void
  onRevert: (id: string) => void
  onNext: () => void
}) =>
  <section id={EXTRACTION_EDITOR_DOM_ID} className="extraction-review-editor flex flex-none scroll-m-4 flex-col overflow-hidden rounded-lg" data-status={selected.status} aria-label={selected.label}>
    <header className="extraction-review-editor__header flex flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="extraction-review-editor__context">{selected.context}</span>
        <span className="extraction-review-editor__badge flex flex-none items-center gap-1 rounded-full py-0.5 pr-2.5 pl-2" data-status={selected.status}>
          <span className="material-symbols-outlined" aria-hidden="true">{selected.statusIcon}</span>
          {selected.statusLabel}
        </span>
      </div>
      <h3 className="extraction-review-editor__label">{selected.label}</h3>
      <p className="extraction-review-editor__guidance">{selected.guidance}</p>
    </header>

    <div className="flex flex-col gap-4 p-4">
      {selected.crop &&
        <figure className="flex flex-col gap-1.5">
          <figcaption className="extraction-review-editor__step flex items-center justify-between">
            On the document
            <span className="extraction-review-editor__page">{selected.pageLabel}</span>
          </figcaption>
          <div style={selected.crop.frameStyle} className="extraction-review-editor__crop relative w-full overflow-hidden rounded-md">
            <img src={selected.crop.imageUrl} alt={`${selected.label} on the document`} draggable={false} style={selected.crop.imageStyle} className="absolute max-w-none select-none" />
            <div style={selected.crop.markerStyle} className="extraction-review-editor__marker absolute rounded-sm" />
          </div>
        </figure>}
      {selected.locationNote && <p className="extraction-review-editor__note rounded-md px-3 py-2">{selected.locationNote}</p>}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="extraction-review-editor__step">We read</span>
          <span className="extraction-review-editor__confidence inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" data-level={selected.confidenceLevel} title="How sure the scanner is that it read this correctly">
            <span className="extraction-review-editor__dot size-1.5 rounded-full" />
            {selected.confidenceLabel} · {selected.confidencePercent}
          </span>
        </div>
        <p className="extraction-review-editor__read rounded-md px-3 py-2.5" data-missing={selected.readAsMissing}>{selected.readAs}</p>
        {selected.normalizedLabel && <p className="extraction-review-editor__hint">Saved as <span className="extraction-review-editor__mono">{selected.normalizedLabel}</span></p>}
      </div>

      {selected.issues.length > 0 &&
        <div className="extraction-review-editor__issues flex flex-col gap-1.5 rounded-md p-3">
          <span className="extraction-review-editor__issues-title flex items-center gap-1.5">
            <span className="material-symbols-outlined" aria-hidden="true">error</span>
            Why it's flagged
          </span>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {selected.issues.map((issue, index) => <li key={index}>{issue}</li>)}
          </ul>
        </div>}

      <div className="flex flex-col gap-1.5">
        <span className="extraction-review-editor__step">{selected.kind === 'checkbox' ? 'Is it checked?' : 'Correct value'}</span>
        {selected.kind === 'checkbox'
          ? <div className="extraction-review-editor__choice grid grid-cols-2 gap-1 rounded-lg p-1" role="radiogroup" aria-label={selected.label}>
            <button type="button" role="radio" aria-checked={selected.checked} className="extraction-review-editor__option flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5" onClick={() => onEdit(selected.id, true)}>
              <span className="material-symbols-outlined" aria-hidden="true">check_box</span>
              Checked
            </button>
            <button type="button" role="radio" aria-checked={!selected.checked} className="extraction-review-editor__option flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5" onClick={() => onEdit(selected.id, false)}>
              <span className="material-symbols-outlined" aria-hidden="true">check_box_outline_blank</span>
              Unchecked
            </button>
          </div>
          : <input type="text" className="extraction-review-editor__input w-full rounded-lg px-3 py-2" aria-label={`Correct value for ${selected.label}`} placeholder="Type the value shown on the document" value={selected.text} onChange={(event) => onEdit(selected.id, event.target.value)} />}
        {selected.changedFrom !== null && <p className="extraction-review-editor__hint">Changed from <span className="extraction-review-editor__mono">{selected.changedFrom}</span></p>}
      </div>
    </div>

    {(selected.canConfirm || selected.canUnconfirm || selected.canRevert || selected.canGoNext) &&
      <footer className="extraction-review-editor__footer flex flex-wrap gap-2 p-4">
        {selected.canConfirm &&
          <button type="button" className="extraction-review-editor__primary flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2" onClick={() => onConfirm(selected.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">check</span>
            Approve as read
          </button>}
        {selected.canUnconfirm &&
          <button type="button" className="extraction-review-editor__secondary flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2" onClick={() => onUnconfirm(selected.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">undo</span>
            Undo approval
          </button>}
        {selected.canRevert &&
          <button type="button" className="extraction-review-editor__secondary flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2" onClick={() => onRevert(selected.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">undo</span>
            Use original
          </button>}
        {selected.canGoNext &&
          <button type="button" className="extraction-review-editor__primary flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2" onClick={onNext}>
            Next flagged
            <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>}
      </footer>}
  </section>

export default ExtractionReviewEditor
