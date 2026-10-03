import './.css'
import type { InsightMessage as InsightMessageData } from '@lpl-hacks/shared/src/types/native/insight/insightMessage'
import { useInsightMessage } from './.ts'
import InsightMessageSegments from './components/InsightMessageSegments/InsightMessageSegments'
import InsightMessageSources from './components/InsightMessageSources/InsightMessageSources'

const InsightMessage = ({ message }: { message: InsightMessageData }) => {
  const item = useInsightMessage(message)

  if (item.isUser) return <li className="insight-message flex flex-col items-end">
    <p className="insight-message__bubble max-w-2/3 rounded-[32px] px-6 py-3">{message.text}</p>
  </li>

  return <li className="insight-message flex flex-col items-start gap-3" aria-busy={item.thinking || item.streaming}>
    {item.thinking &&
      <p className="insight-message__thinking flex items-center gap-2" role="status">
        <span className="insight-message__dots flex gap-1" aria-hidden="true"><span /><span /><span /></span>
        Searching this household's records…
      </p>}

    {!item.thinking && !!item.blocks.length &&
      <div className="insight-message__body flex w-full flex-col gap-4" data-streaming={item.streaming}>
        {item.blocks.map((block) => block.kind === 'list'
          ? <ul key={block.key} className="insight-message__list flex flex-col gap-1">
            {block.items.map((segments, index) => <li key={index}><InsightMessageSegments segments={segments} onCite={item.showSource} /></li>)}
          </ul>
          : <p key={block.key}><InsightMessageSegments segments={block.segments} onCite={item.showSource} /></p>)}
      </div>}

    {item.failed &&
      <p className="insight-message__failed flex items-center gap-2 rounded-lg px-4 py-3" role="alert">
        <span className="material-symbols-outlined text-xl leading-none" aria-hidden="true">error</span>
        {message.failureMessage}
      </p>}

    {item.complete && !!item.sources.length && <InsightMessageSources sources={item.sources} />}

    {item.complete &&
      <button type="button" onClick={item.copy} className="insight-message__action flex items-center justify-center rounded-full p-3" aria-label={item.copied ? 'Copied' : 'Copy response'}>
        <span className="material-symbols-outlined text-2xl leading-none">{item.copied ? 'check' : 'content_copy'}</span>
      </button>}
  </li>
}

export default InsightMessage
