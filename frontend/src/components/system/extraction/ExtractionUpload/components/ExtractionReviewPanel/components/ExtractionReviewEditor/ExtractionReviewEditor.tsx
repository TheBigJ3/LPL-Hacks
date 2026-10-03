import './.css'
import { EXTRACTION_EDITOR_DOM_ID, type ExtractionEditValue, type ExtractionSelectedView } from '../../../../.ts'

const ExtractionReviewEditor = ({ selected, onEdit, onConfirm, onRevert }: {
  selected: ExtractionSelectedView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onConfirm: (id: string) => void
  onRevert: (id: string) => void
}) =>
  <section className="extraction-review-editor flex flex-col gap-3 rounded-lg p-4" aria-label={selected.label}>
    <div className="flex items-start justify-between gap-3">
      <p className="extraction-review-editor__label">{selected.label}</p>
      <span className="extraction-review-editor__badge flex-none rounded-full px-2 py-0.5" data-status={selected.status}>{selected.statusLabel}</span>
    </div>
    {selected.crop &&
      <div style={selected.crop.frameStyle} className="extraction-review-editor__crop relative w-full overflow-hidden rounded-md">
        <img src={selected.crop.imageUrl} alt="" draggable={false} style={selected.crop.imageStyle} className="absolute max-w-none select-none" />
        <div style={selected.crop.markerStyle} className="extraction-review-editor__marker absolute rounded-sm" />
      </div>}
    <dl className="extraction-review-editor__details grid items-center gap-x-3 gap-y-1.5">
      <dt>OCR read</dt>
      <dd className="extraction-review-editor__mono break-all">{selected.readAs}</dd>
      {selected.normalizedLabel && <>
        <dt>Parsed</dt>
        <dd className="extraction-review-editor__mono">{selected.normalizedLabel}</dd>
      </>}
      <dt>Confidence</dt>
      <dd>
        <span className="extraction-review-editor__confidence inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" data-level={selected.confidenceLevel}>
          <span className="extraction-review-editor__dot size-1.5 rounded-full" />
          {selected.confidencePercent}
        </span>
      </dd>
    </dl>
    {selected.issues.length > 0 &&
      <ul className="extraction-review-editor__issues flex flex-col gap-1 rounded-md p-2.5">
        {selected.issues.map((issue, index) =>
          <li key={index} className="flex gap-1.5">
            <span className="material-symbols-outlined pt-px" aria-hidden="true">error</span>
            {issue}
          </li>
        )}
      </ul>}
    {selected.kind === 'checkbox'
      ? <label className="extraction-review-editor__check flex items-center gap-2">
        <input id={EXTRACTION_EDITOR_DOM_ID} type="checkbox" className="size-4" checked={selected.checked} onChange={(event) => onEdit(selected.id, event.target.checked)} />
        Checked
      </label>
      : <input id={EXTRACTION_EDITOR_DOM_ID} type="text" className="extraction-review-editor__input w-full rounded-lg px-3 py-2" aria-label={selected.label} value={selected.text} onChange={(event) => onEdit(selected.id, event.target.value)} />}
    {(selected.canConfirm || selected.canRevert) &&
      <div className="flex gap-2">
        {selected.canConfirm &&
          <button type="button" className="extraction-review-editor__action flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2" onClick={() => onConfirm(selected.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">check</span>
            Looks right
          </button>}
        {selected.canRevert &&
          <button type="button" className="extraction-review-editor__action flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2" onClick={() => onRevert(selected.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">undo</span>
            Undo edit
          </button>}
      </div>}
  </section>

export default ExtractionReviewEditor
