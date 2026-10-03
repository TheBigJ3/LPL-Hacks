import './.css'
import type { ExtractionDocumentView, ExtractionEditValue, ExtractionLayout } from '../../.ts'

const ExtractionDocument = ({ document, onEdit, onSelect, onLayout, onToggleValues }: {
  document: ExtractionDocumentView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onSelect: (id: string) => void
  onLayout: (layout: ExtractionLayout) => void
  onToggleValues: () => void
}) =>
  <section className="extraction-document flex min-w-0 flex-col gap-3" data-show-values={document.showValues} aria-label="Document">
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="extraction-document__segmented flex rounded-lg p-0.5" role="group" aria-label="Page view">
        {document.layoutOptions.map((option) =>
          <button key={option.value} type="button" className="extraction-document__segment rounded-md px-3 py-1" data-active={option.active} aria-pressed={option.active} disabled={option.disabled} onClick={() => onLayout(option.value)}>
            {option.label}
          </button>
        )}
      </div>
      <button type="button" className="extraction-document__toggle rounded-lg px-3 py-1.5" onClick={onToggleValues}>{document.showValuesLabel}</button>
    </div>

    {document.pages.map((page) =>
      <div key={page.number} style={page.style} className="extraction-document__page @container relative w-full overflow-hidden rounded-lg">
        {page.imageUrl && <img src={page.imageUrl} alt={`Page ${page.number}`} draggable={false} className="absolute inset-0 h-full w-full select-none" />}
        {page.lines.map((line) => <span key={line.key} style={line.style} className="extraction-document__line absolute whitespace-nowrap">{line.text}</span>)}
        {page.overlays.map((overlay) => overlay.kind === 'checkbox'
          ? <button key={overlay.id} id={overlay.domId} type="button" role="checkbox" aria-checked={overlay.checked} aria-label={overlay.label} title={overlay.label} disabled={!document.showValues} style={overlay.style} className="extraction-document__overlay absolute flex items-center justify-center" data-kind={overlay.kind} data-status={overlay.status} data-selected={overlay.selected} onFocus={() => onSelect(overlay.id)} onClick={() => onEdit(overlay.id, !overlay.checked)}>
            {overlay.checked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" className="size-[80%]" aria-hidden="true"><path d="M4.5 12.5l5 5L19.5 7" /></svg>}
          </button>
          : overlay.kind === 'multiline'
            ? <textarea key={overlay.id} id={overlay.domId} aria-label={overlay.label} title={overlay.label} disabled={!document.showValues} style={overlay.style} className="extraction-document__overlay absolute resize-none overflow-hidden" data-kind={overlay.kind} data-status={overlay.status} data-empty={overlay.empty} data-selected={overlay.selected} value={overlay.text} onFocus={() => onSelect(overlay.id)} onChange={(event) => onEdit(overlay.id, event.target.value)} />
            : <input key={overlay.id} id={overlay.domId} type="text" aria-label={overlay.label} title={overlay.label} disabled={!document.showValues} style={overlay.style} className="extraction-document__overlay absolute" data-kind={overlay.kind} data-status={overlay.status} data-empty={overlay.empty} data-selected={overlay.selected} value={overlay.text} onFocus={() => onSelect(overlay.id)} onChange={(event) => onEdit(overlay.id, event.target.value)} />)}
      </div>
    )}
  </section>

export default ExtractionDocument
