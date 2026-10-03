import {
  EXTRACTION_CONFIDENCE_DOT_CLASSES,
  EXTRACTION_CONFIDENCE_PILL_CLASSES,
  EXTRACTION_EDITOR_DOM_ID,
  EXTRACTION_STATUS_BADGE_CLASSES,
  type ExtractionEditValue,
  type ExtractionSelectedView,
} from '@components/system/extraction/ExtractionUpload/.ts'

export default function ExtractionReviewEditor({ selected, onEdit, onConfirm, onRevert }: {
  selected: ExtractionSelectedView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onConfirm: (id: string) => void
  onRevert: (id: string) => void
}) {
  return <section className="flex flex-col gap-3 rounded-xl border border-card-outlines bg-card-bg p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-bold text-main-white">{selected.label}</p>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${EXTRACTION_STATUS_BADGE_CLASSES[selected.status]}`}>{selected.statusLabel}</span>
    </div>
    {selected.crop && <div style={selected.crop.frameStyle} className="relative w-full overflow-hidden rounded-md bg-white">
      <img src={selected.crop.imageUrl} alt="" draggable={false} style={selected.crop.imageStyle} className="absolute max-w-none select-none" />
      <div style={selected.crop.markerStyle} className="absolute rounded-sm ring-2 ring-review-yellow" />
    </div>}
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-placeholder-gray">OCR read</dt>
      <dd className="break-all font-mono text-paragraph-off-white">{selected.readAs}</dd>
      {selected.normalizedLabel && <>
        <dt className="text-placeholder-gray">Parsed</dt>
        <dd className="font-mono text-paragraph-off-white">{selected.normalizedLabel}</dd>
      </>}
      <dt className="text-placeholder-gray">Confidence</dt>
      <dd>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 tabular-nums ${EXTRACTION_CONFIDENCE_PILL_CLASSES[selected.confidenceLevel]}`}>
          <span className={`size-1.5 rounded-full ${EXTRACTION_CONFIDENCE_DOT_CLASSES[selected.confidenceLevel]}`} />
          {selected.confidencePercent}
        </span>
      </dd>
    </dl>
    {selected.issues.length > 0 && <ul className="flex flex-col gap-1 rounded-lg bg-review-yellow/10 p-2.5 text-xs text-review-yellow">
      {selected.issues.map((issue, index) => <li key={index} className="flex gap-1.5">
        <span className="material-symbols-outlined pt-px text-sm">error</span>
        {issue}
      </li>)}
    </ul>}
    {selected.kind === 'checkbox'
      ? <label className="flex items-center gap-2 text-sm text-main-white">
        <input id={EXTRACTION_EDITOR_DOM_ID} type="checkbox" checked={selected.checked} onChange={(event) => onEdit(selected.id, event.target.checked)} className="size-4 accent-main-pink" />
        Checked
      </label>
      : <input id={EXTRACTION_EDITOR_DOM_ID} type="text" aria-label={selected.label} value={selected.text} onChange={(event) => onEdit(selected.id, event.target.value)} className="w-full rounded-lg border border-card-outlines bg-main-black px-3 py-2 text-sm text-main-white outline-none transition-colors focus:border-main-pink" />}
    {(selected.canConfirm || selected.canRevert) && <div className="flex gap-2">
      {selected.canConfirm && <button type="button" onClick={() => onConfirm(selected.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-card-outlines px-3 py-2 text-sm text-main-white transition-colors hover:bg-card-outlines-faint">
        <span className="material-symbols-outlined text-base">check</span>
        Looks right
      </button>}
      {selected.canRevert && <button type="button" onClick={() => onRevert(selected.id)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-card-outlines px-3 py-2 text-sm text-paragraph-off-white transition-colors hover:bg-card-outlines-faint">
        <span className="material-symbols-outlined text-base">undo</span>
        Undo edit
      </button>}
    </div>}
  </section>
}
