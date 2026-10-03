import './.css'
import type { ExtractionEditValue, ExtractionReviewView } from '../../.ts'
import ExtractionReviewEditor from './components/ExtractionReviewEditor/ExtractionReviewEditor'
import ExtractionReviewList from './components/ExtractionReviewList/ExtractionReviewList'

const ExtractionReviewPanel = ({ review, onEdit, onConfirm, onRevert, onFocusItem, onNext }: {
  review: ExtractionReviewView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onConfirm: (id: string) => void
  onRevert: (id: string) => void
  onFocusItem: (id: string) => void
  onNext: () => void
}) =>
  <aside className="extraction-review-panel flex flex-col gap-4" aria-label="Changes">
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
    </div>
    {review.selected && <ExtractionReviewEditor selected={review.selected} onEdit={onEdit} onConfirm={onConfirm} onRevert={onRevert} />}
    {review.flagged.length > 0 && <ExtractionReviewList title="Flagged" items={review.flagged} onFocusItem={onFocusItem} />}
    {review.missing.length > 0 && <ExtractionReviewList title="Not on the page" items={review.missing} onFocusItem={onFocusItem} />}
  </aside>

export default ExtractionReviewPanel
