import type { ExtractionDocumentView, ExtractionEditValue, ExtractionLayout } from '@components/system/extraction/ExtractionUpload/.ts'

export default function ExtractionDocument({ document, onEdit, onSelect, onLayout, onToggleValues }: {
  document: ExtractionDocumentView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onSelect: (id: string) => void
  onLayout: (layout: ExtractionLayout) => void
  onToggleValues: () => void
}) {
  return <section className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h5 className="font-bold text-main-white">Document</h5>
      <div className="flex items-center gap-2 text-sm">
        <div className="flex rounded-lg border border-card-outlines p-0.5">
          {document.layoutOptions.map((option) => <button key={option.value} type="button" disabled={option.disabled} onClick={() => onLayout(option.value)} className={`rounded-md px-3 py-1 transition-colors ${option.className}`}>
            {option.label}
          </button>)}
        </div>
        <button type="button" onClick={onToggleValues} className="rounded-lg border border-card-outlines px-3 py-1.5 text-paragraph-off-white transition-colors hover:text-main-white">
          {document.showValuesLabel}
        </button>
      </div>
    </div>
    {document.pages.map((page) => <div key={page.number} style={page.style} className="@container relative w-full overflow-hidden rounded-lg bg-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {page.imageUrl && <img src={page.imageUrl} alt={`Page ${page.number}`} draggable={false} className="absolute inset-0 h-full w-full select-none" />}
      {page.lines.map((line) => <span key={line.key} style={line.style} className="absolute whitespace-nowrap leading-none text-black/80">{line.text}</span>)}
      {page.overlays.map((overlay) => overlay.kind === 'checkbox'
        ? <button key={overlay.id} id={overlay.domId} type="button" role="checkbox" aria-checked={overlay.checked} aria-label={overlay.label} title={overlay.label} disabled={!document.showValues} style={overlay.style} className={overlay.className} onFocus={() => onSelect(overlay.id)} onClick={() => onEdit(overlay.id, !overlay.checked)}>
          {overlay.checked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="size-[80%]" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" /></svg>}
        </button>
        : overlay.kind === 'multiline'
          ? <textarea key={overlay.id} id={overlay.domId} aria-label={overlay.label} title={overlay.label} disabled={!document.showValues} style={overlay.style} className={overlay.className} value={overlay.text} onFocus={() => onSelect(overlay.id)} onChange={(event) => onEdit(overlay.id, event.target.value)} />
          : <input key={overlay.id} id={overlay.domId} type="text" aria-label={overlay.label} title={overlay.label} disabled={!document.showValues} style={overlay.style} className={overlay.className} value={overlay.text} onFocus={() => onSelect(overlay.id)} onChange={(event) => onEdit(overlay.id, event.target.value)} />)}
    </div>)}
  </section>
}
