import './.css'
import type { ExtractionTagView } from '../../../../../../.ts'

const ExtractionTagSummary = ({ tag, onRetry }: { tag: ExtractionTagView; onRetry: () => void }) =>
  <section className="extraction-tag-summary flex flex-col gap-3 rounded-lg p-4" data-state={tag.state} aria-live="polite" aria-label="Tags">
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined extraction-tag-summary__icon flex-none" data-state={tag.state} aria-hidden="true">{tag.icon}</span>
      <h3 className="extraction-tag-summary__title">{tag.title}</h3>
    </div>
    <p className="extraction-tag-summary__message">{tag.message}</p>

    {tag.state === 'tagged' && <dl className="extraction-tag-summary__groups flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <dt className="extraction-tag-summary__label">Document type</dt>
        <dd className="flex flex-wrap gap-1.5">
          {tag.docType ? <span className="extraction-tag-summary__chip rounded-full" data-kind="type">{tag.docType}</span>
            : <span className="extraction-tag-summary__empty">Couldn't tell</span>}
        </dd>
      </div>
      <div className="flex flex-col gap-1.5">
        <dt className="extraction-tag-summary__label">Topics</dt>
        <dd className="flex flex-wrap gap-1.5">
          {tag.tags.length > 0 ? tag.tags.map((name) => <span key={name} className="extraction-tag-summary__chip rounded-full">{name}</span>)
            : <span className="extraction-tag-summary__empty">None found</span>}
        </dd>
      </div>
      <div className="flex flex-col gap-1.5">
        <dt className="extraction-tag-summary__label">Family members</dt>
        <dd className="flex flex-wrap gap-1.5">
          {tag.members.length > 0 ? tag.members.map((name) => <span key={name} className="extraction-tag-summary__chip rounded-full" data-kind="member">{name}</span>)
            : <span className="extraction-tag-summary__empty">None found</span>}
        </dd>
      </div>
    </dl>}

    {tag.indexNote && <p className="extraction-tag-summary__index flex items-center gap-1.5">
      <span className="material-symbols-outlined" aria-hidden="true">travel_explore</span>
      {tag.indexNote}
    </p>}

    {tag.canRetry && <button type="button" className="extraction-tag-summary__retry flex items-center justify-center gap-1.5 rounded-lg px-3 py-2" onClick={onRetry}>
      <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
      Try again
    </button>}
  </section>

export default ExtractionTagSummary
