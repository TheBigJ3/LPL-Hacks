import type { ExtractionReviewListItem } from '@components/system/extraction/ExtractionUpload/.ts'

export default function ExtractionReviewList({ title, items, onFocusItem }: {
  title: string
  items: ExtractionReviewListItem[]
  onFocusItem: (id: string) => void
}) {
  return <section className="flex flex-col gap-1.5 rounded-xl border border-card-outlines bg-card-bg p-2">
    <h6 className="px-2 pt-1 text-xs uppercase tracking-wider text-placeholder-gray">{title}</h6>
    <ul className="flex flex-col">
      {items.map((item) => <li key={item.id}>
        <button type="button" onClick={() => onFocusItem(item.id)} className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-card-outlines-faint ${item.className}`}>
          <span className={`material-symbols-outlined pt-0.5 text-base ${item.iconClassName}`}>{item.icon}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-main-white">{item.label}</span>
            <span className="line-clamp-2 text-xs text-placeholder-gray">{item.summary}</span>
          </span>
        </button>
      </li>)}
    </ul>
  </section>
}
