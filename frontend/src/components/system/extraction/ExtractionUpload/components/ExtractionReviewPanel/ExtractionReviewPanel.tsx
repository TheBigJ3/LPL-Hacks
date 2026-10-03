import './.css'
import { EXTRACTION_PANEL_DOM_ID, type ExtractionEditValue, type ExtractionReviewView } from '../../.ts'
import ExtractionReviewEditor from './components/ExtractionReviewEditor/ExtractionReviewEditor'
import ExtractionReviewList from './components/ExtractionReviewList/ExtractionReviewList'

const ExtractionReviewPanel = ({ review, onEdit, onConfirm, onRevert, onFocusItem, onNext, onConfirmExport }: {
  review: ExtractionReviewView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onConfirm: (id: string) => void
  onRevert: (id: string) => void
  onFocusItem: (id: string) => void
  onNext: () => void
  onConfirmExport: () => void
}) =>
  <aside id={EXTRACTION_PANEL_DOM_ID} className="extraction-review-panel flex flex-col gap-4" aria-label="Changes">
    <div className="extraction-review-panel__card flex flex-col gap-3 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="extraction-review-panel__title">Changes</h2>
        <span className="extraction-review-panel__count">{review.resolved} of {review.total} done</span>
      </div>
      <div className="extraction-review-panel__track h-1.5 overflow-hidden rounded-full">
        <div style={review.progressStyle} className="extraction-review-panel__progress h-full rounded-full" />
      </div>
      <button type="button" className="extraction-review-panel__next flex items-center justify-center gap-1.5 rounded-lg px-3 py-2" disabled={review.unresolved === 0} onClick={onNext}>
        {review.nextLabel}
        <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
      </button>
      <button type="button" className="extraction-review-panel__confirm flex items-center justify-center gap-1.5 rounded-lg px-3 py-2" data-ready={review.unresolved === 0} onClick={onConfirmExport}>
        <span className="material-symbols-outlined" aria-hidden="true">download</span>
        Confirm &amp; download JSON
      </button>
      {review.exportHint && <p className="extraction-review-panel__hint">{review.exportHint}</p>}
    </div>
    {review.selected && <ExtractionReviewEditor selected={review.selected} onEdit={onEdit} onConfirm={onConfirm} onRevert={onRevert} />}
    {review.flagged.length > 0 && <ExtractionReviewList title="Flagged" items={review.flagged} onFocusItem={onFocusItem} />}
    {review.pickedUp.length > 0 && <ExtractionReviewList title="Picked up" items={review.pickedUp} onFocusItem={onFocusItem} />}
    {review.missing.length > 0 && <ExtractionReviewList title="Not on the page" items={review.missing} onFocusItem={onFocusItem} />}
  </aside>

export default ExtractionReviewPanel
