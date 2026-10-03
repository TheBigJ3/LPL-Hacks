import './.css'
import type { InsightSourceView } from '../../.ts'

const InsightMessageSources = ({ sources }: { sources: InsightSourceView[] }) =>
  <section className="insight-message-sources flex w-full flex-col gap-2" aria-label="Sources">
    <h3 className="insight-message-sources__title">Sources</h3>
    <ol className="flex flex-col gap-2">
      {sources.map((source) =>
        <li key={source.sourceId}>
          <details id={source.domId} className="insight-message-sources__item rounded-lg">
            <summary className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2">
              <span className="insight-message-sources__number grid flex-none place-items-center rounded-full">{source.number}</span>
              <span className="material-symbols-outlined insight-message-sources__icon flex-none" aria-hidden="true">{source.icon}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="insight-message-sources__name truncate">{source.title}</span>
                <span className="insight-message-sources__detail">{source.detail}</span>
              </span>
              <span className="insight-message-sources__badge flex-none rounded-full px-2 py-0.5" data-badge={source.badge}>{source.badgeLabel}</span>
            </summary>
            <blockquote className="insight-message-sources__quote mx-3 mb-3 rounded-md px-3 py-2">{source.quote}</blockquote>
          </details>
        </li>
      )}
    </ol>
  </section>

export default InsightMessageSources
