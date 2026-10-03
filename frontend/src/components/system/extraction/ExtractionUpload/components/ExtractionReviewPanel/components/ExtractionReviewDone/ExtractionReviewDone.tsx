import './.css'
import type { ExtractionConfirmView, ExtractionDoneView, ExtractionTagView } from '../../../../.ts'
import ExtractionTagSummary from './components/ExtractionTagSummary/ExtractionTagSummary'

const ExtractionReviewDone = ({ done, confirm, tag, onConfirmAndTag, onContinue, onShowAll }: {
  done: ExtractionDoneView
  confirm: ExtractionConfirmView
  tag: ExtractionTagView | null
  onConfirmAndTag: () => void
  onContinue: () => void
  onShowAll: () => void
}) =>
  <section className="extraction-review-done flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center" data-complete={done.complete} aria-live="polite">
    <span className="material-symbols-outlined extraction-review-done__icon grid place-items-center rounded-full" aria-hidden="true">{done.complete ? 'task_alt' : 'pending_actions'}</span>

    <div className="flex flex-col gap-1.5">
      <h2 className="extraction-review-done__title">{done.title}</h2>
      <p className="extraction-review-done__subtitle">{done.subtitle}</p>
    </div>

    {done.stats.length > 0 &&
      <dl className="grid w-full grid-cols-2 gap-2">
        {done.stats.map((stat) =>
          <div key={stat.label} className="extraction-review-done__stat flex flex-col gap-0.5 rounded-lg px-3 py-2.5" data-status={stat.status}>
            <dt className="extraction-review-done__stat-label">{stat.label}</dt>
            <dd className="extraction-review-done__stat-value">{stat.value}</dd>
          </div>
        )}
      </dl>}

    <div className="flex w-full flex-col gap-2">
      {done.complete
        ? <button type="button" className="extraction-review-done__primary flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5" disabled={confirm.disabled} onClick={onConfirmAndTag}>
          <span className="material-symbols-outlined" data-icon={confirm.icon} aria-hidden="true">{confirm.icon}</span>
          {confirm.label}
        </button>
        : <button type="button" className="extraction-review-done__primary flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5" onClick={onContinue}>
          Continue checking
          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>}
      <button type="button" className="extraction-review-done__secondary flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5" onClick={onShowAll}>
        <span className="material-symbols-outlined" aria-hidden="true">list</span>
        Look over all fields
      </button>
    </div>

    {tag && <div className="extraction-review-done__tag w-full"><ExtractionTagSummary tag={tag} onRetry={onConfirmAndTag} /></div>}
  </section>

export default ExtractionReviewDone
