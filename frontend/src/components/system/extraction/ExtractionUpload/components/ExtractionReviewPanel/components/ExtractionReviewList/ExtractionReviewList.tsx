import './.css'
import type { ExtractionReviewGroup } from '../../../../.ts'

const ExtractionReviewList = ({ group, onPick }: {
  group: ExtractionReviewGroup
  onPick: (id: string) => void
}) =>
  <section className="extraction-review-list flex flex-col gap-1" aria-label={group.title}>
    <h3 className="extraction-review-list__title px-2 pt-1">{group.title} <span className="extraction-review-list__count">{group.items.length}</span></h3>
    <ul className="flex flex-col">
      {group.items.map((item) =>
        <li key={item.id}>
          <button type="button" className="extraction-review-list__item flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left" data-selected={item.selected} onClick={() => onPick(item.id)}>
            <span className="material-symbols-outlined extraction-review-list__icon pt-0.5" data-status={item.status} aria-hidden="true">{item.icon}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="extraction-review-list__label truncate">{item.label}</span>
              <span className="extraction-review-list__summary line-clamp-2">{item.summary}</span>
            </span>
            <span className="material-symbols-outlined extraction-review-list__chevron flex-none self-center" aria-hidden="true">chevron_right</span>
          </button>
        </li>
      )}
    </ul>
  </section>

export default ExtractionReviewList
