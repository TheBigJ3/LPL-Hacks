import './.css'
import type { ExtractionReviewListItem } from '../../../../.ts'

const ExtractionReviewList = ({ title, items, onFocusItem }: {
  title: string
  items: ExtractionReviewListItem[]
  onFocusItem: (id: string) => void
}) =>
  <section className="extraction-review-list flex flex-col gap-1.5 rounded-lg p-2" aria-label={title}>
    <h3 className="extraction-review-list__title px-2 pt-1">{title}</h3>
    <ul className="flex flex-col">
      {items.map((item) =>
        <li key={item.id}>
          <button type="button" className="extraction-review-list__item flex w-full items-start gap-2 rounded-md px-2 py-2 text-left" data-selected={item.selected} onClick={() => onFocusItem(item.id)}>
            <span className="material-symbols-outlined extraction-review-list__icon pt-0.5" data-open={item.open} aria-hidden="true">{item.icon}</span>
            <span className="flex min-w-0 flex-col">
              <span className="extraction-review-list__label truncate">{item.label}</span>
              <span className="extraction-review-list__summary line-clamp-2">{item.summary}</span>
            </span>
          </button>
        </li>
      )}
    </ul>
  </section>

export default ExtractionReviewList
