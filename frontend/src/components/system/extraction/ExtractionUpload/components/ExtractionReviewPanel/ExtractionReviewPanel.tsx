import './.css'
import {
  EXTRACTION_HIGHLIGHT_LEGEND,
  EXTRACTION_PANEL_DOM_ID,
  type ExtractionConfirmView,
  type ExtractionEditValue,
  type ExtractionReviewView,
  type ExtractionTagView,
} from '../../.ts'
import ExtractionReviewEditor from './components/ExtractionReviewEditor/ExtractionReviewEditor'
import ExtractionReviewList from './components/ExtractionReviewList/ExtractionReviewList'
import ExtractionTagSummary from './components/ExtractionTagSummary/ExtractionTagSummary'

const ExtractionReviewPanel = ({ review, confirm, tag, onEdit, onConfirm, onUnconfirm, onRevert, onFocusItem, onNext, onConfirmAndTag }: {
  review: ExtractionReviewView
  confirm: ExtractionConfirmView
  tag: ExtractionTagView | null
  onEdit: (id: string, value: ExtractionEditValue) => void
  onConfirm: (id: string) => void
  onUnconfirm: (id: string) => void
  onRevert: (id: string) => void
  onFocusItem: (id: string) => void
  onNext: () => void
  onConfirmAndTag: () => void
}) =>
  <aside id={EXTRACTION_PANEL_DOM_ID} className="extraction-review-panel flex flex-col gap-4" aria-label="Review">
    <div className="extraction-review-panel__card flex flex-col gap-3 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="extraction-review-panel__title">Review</h2>
        <span className="extraction-review-panel__count">{review.resolved} of {review.total} done</span>
      </div>
      <div className="extraction-review-panel__track h-1.5 overflow-hidden rounded-full">
        <div style={review.progressStyle} className="extraction-review-panel__progress h-full rounded-full" />
      </div>
      <ul className="extraction-review-panel__legend flex flex-wrap gap-x-3 gap-y-1" aria-label="Highlight colors">
        {EXTRACTION_HIGHLIGHT_LEGEND.map((entry) =>
          <li key={entry.status} className="flex items-center gap-1.5">
            <span className="extraction-review-panel__swatch h-2.5 w-4 rounded-sm" data-status={entry.status} />
            {entry.label}
          </li>
        )}
      </ul>
      <button type="button" className="extraction-review-panel__next flex items-center justify-center gap-1.5 rounded-lg px-3 py-2" disabled={review.unresolved === 0} onClick={onNext}>
        {review.nextLabel}
        <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
      </button>
      <button type="button" className="extraction-review-panel__confirm flex items-center justify-center gap-1.5 rounded-lg px-3 py-2" data-ready={!confirm.disabled} disabled={confirm.disabled} onClick={onConfirmAndTag}>
        <span className="material-symbols-outlined" data-icon={confirm.icon} aria-hidden="true">{confirm.icon}</span>
        {confirm.label}
      </button>
      {confirm.hint && <p className="extraction-review-panel__hint">{confirm.hint}</p>}
    </div>
    {tag && <ExtractionTagSummary tag={tag} onRetry={onConfirmAndTag} />}
    {review.selected
      ? <ExtractionReviewEditor selected={review.selected} onEdit={onEdit} onConfirm={onConfirm} onUnconfirm={onUnconfirm} onRevert={onRevert} onNext={onNext} />
      : <p className="extraction-review-panel__empty flex items-start gap-2 rounded-lg p-4">
        <span className="material-symbols-outlined" aria-hidden="true">touch_app</span>
        Click a highlighted value on the document, or press Next to review, to check it here.
      </p>}
    {review.flagged.length > 0 && <ExtractionReviewList title="Flagged" items={review.flagged} onFocusItem={onFocusItem} />}
    {review.pickedUp.length > 0 && <ExtractionReviewList title="Picked up" items={review.pickedUp} onFocusItem={onFocusItem} />}
    {review.missing.length > 0 && <ExtractionReviewList title="Not on the page" items={review.missing} onFocusItem={onFocusItem} />}
  </aside>

export default ExtractionReviewPanel
