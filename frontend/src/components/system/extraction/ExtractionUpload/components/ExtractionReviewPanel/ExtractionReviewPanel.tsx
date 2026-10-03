import type { ExtractionEditValue, ExtractionReviewView } from '@components/system/extraction/ExtractionUpload/.ts'
import ExtractionReviewEditor from './components/ExtractionReviewEditor/ExtractionReviewEditor'
import ExtractionReviewList from './components/ExtractionReviewList/ExtractionReviewList'

export default function ExtractionReviewPanel({ review, onEdit, onConfirm, onRevert, onFocusItem, onNext }: {
  review: ExtractionReviewView
  onEdit: (id: string, value: ExtractionEditValue) => void
  onConfirm: (id: string) => void
  onRevert: (id: string) => void
  onFocusItem: (id: string) => void
  onNext: () => void
}) {
  return <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
    <div className="flex flex-col gap-3 rounded-xl border border-card-outlines bg-card-bg p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h5 className="font-bold text-main-white">Review</h5>
        <span className="text-sm text-placeholder-gray tabular-nums">{review.resolved} of {review.total} done</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-card-outlines">
        <div style={review.progressStyle} className="h-full rounded-full bg-review-yellow transition-[width] duration-300" />
      </div>
      <button type="button" disabled={review.unresolved === 0} onClick={onNext} className="flex items-center justify-center gap-1.5 rounded-lg bg-review-yellow px-3 py-2 text-sm font-bold text-main-black transition-opacity hover:opacity-90 disabled:bg-card-outlines disabled:text-placeholder-gray">
        {review.nextLabel}
        <span className="material-symbols-outlined text-base">arrow_forward</span>
      </button>
    </div>
    {review.selected && <ExtractionReviewEditor selected={review.selected} onEdit={onEdit} onConfirm={onConfirm} onRevert={onRevert} />}
    {review.flagged.length > 0 && <ExtractionReviewList title="Flagged" items={review.flagged} onFocusItem={onFocusItem} />}
    {review.missing.length > 0 && <ExtractionReviewList title="Not on the page" items={review.missing} onFocusItem={onFocusItem} />}
  </aside>
}
