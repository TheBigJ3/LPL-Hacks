import './.css'
import type { ExtractionDocumentView } from '../../.ts'

const ExtractionDocument = ({ document, onSelect }: {
  document: ExtractionDocumentView
  onSelect: (id: string) => void
}) =>
  <section className="extraction-document flex min-w-0 flex-col gap-3" aria-label="Document">
    {document.previewMessage && <p className="extraction-document__notice rounded-lg px-4 py-3">{document.previewMessage}</p>}
    {document.pages.map((page) =>
      <div key={page.number} style={page.style} className="extraction-document__page relative w-full overflow-hidden rounded-lg">
        <img src={page.imageUrl} alt={`Page ${page.number}`} draggable={false} className="absolute inset-0 h-full w-full select-none" />
        {page.highlights.map((highlight) =>
          <button key={highlight.id} id={highlight.domId} type="button" aria-label={highlight.label} title={highlight.label} aria-pressed={highlight.selected} style={highlight.style} className="extraction-document__highlight absolute rounded-sm" data-status={highlight.status} data-selected={highlight.selected} onClick={() => onSelect(highlight.id)} />
        )}
      </div>
    )}
  </section>

export default ExtractionDocument
