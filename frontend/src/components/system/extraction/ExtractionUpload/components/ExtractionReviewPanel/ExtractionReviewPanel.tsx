import './.css'
import type { FormEvent } from 'react'
import type { ExtractionEditValue, ExtractionPanelView, ExtractionReviewView } from '../../.ts'
import ExtractionReviewDone from './components/ExtractionReviewDone/ExtractionReviewDone'
import ExtractionReviewEditor from './components/ExtractionReviewEditor/ExtractionReviewEditor'
import ExtractionReviewList from './components/ExtractionReviewList/ExtractionReviewList'

type ExtractionReviewPanelProps = {
  review: ExtractionReviewView
  onView: (view: ExtractionPanelView) => void
  onPick: (id: string) => void
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  onChange: (value: ExtractionEditValue) => void
  onSubmit: (event: FormEvent) => void
  onUndo: () => void
  onDownload: () => void
}

const ExtractionReviewPanel = ({ review, onView, onPick, onPrev, onNext, onSkip, onChange, onSubmit, onUndo, onDownload }: ExtractionReviewPanelProps) =>
  <aside className="extraction-review-panel flex flex-col overflow-hidden rounded-lg" aria-label="Review">
    <div role="tablist" aria-label="Review views" className="extraction-review-panel__tabs grid grid-cols-2 gap-1 p-1">
      {review.tabs.map((tab) =>
        <button
          key={tab.view}
          type="button"
          role="tab"
          aria-selected={tab.selected}
          className="extraction-review-panel__tab flex items-center justify-center gap-2 rounded-md px-3 py-2"
          onClick={() => onView(tab.view)}
        >
          {tab.label}
          <span className="extraction-review-panel__tab-count rounded-full px-1.5">{tab.count}</span>
        </button>
      )}
    </div>

    <div role="tabpanel" className="extraction-review-panel__body flex min-h-0 flex-1 flex-col">
      {review.view === 'all'
        ? <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {review.groups.map((group) => <ExtractionReviewList key={group.title} group={group} onPick={onPick} />)}
        </div>
        : review.selected
          ? <ExtractionReviewEditor
            selected={review.selected}
            stepper={review.stepper}
            onPick={onPick}
            onPrev={onPrev}
            onNext={onNext}
            onSkip={onSkip}
            onChange={onChange}
            onSubmit={onSubmit}
            onUndo={onUndo}
          />
          : <ExtractionReviewDone done={review.done} onDownload={onDownload} onContinue={() => onView('check')} onShowAll={() => onView('all')} />}
    </div>
  </aside>

export default ExtractionReviewPanel
