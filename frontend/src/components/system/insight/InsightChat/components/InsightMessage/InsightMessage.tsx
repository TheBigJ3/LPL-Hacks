import './.css'
import type { InsightChatMessage } from '../../.ts'
import { useInsightMessage } from './.ts'

const InsightMessage = ({ message }: { message: InsightChatMessage }) => {
  const item = useInsightMessage(message)

  if (item.isUser) return <li className="insight-message flex flex-col items-end">
    <p className="insight-message__bubble max-w-2/3 rounded-[32px] px-6 py-3">{message.text}</p>
  </li>

  return <li className="insight-message flex flex-col items-start gap-3">
    <p className="insight-message__body w-full">{message.text}</p>
    <button type="button" onClick={item.copy} className="insight-message__action flex items-center justify-center rounded-full p-3" aria-label={item.copied ? 'Copied' : 'Copy response'}>
      <span className="material-symbols-outlined text-2xl leading-none">{item.copied ? 'check' : 'content_copy'}</span>
    </button>
  </li>
}

export default InsightMessage
