import './.css'
import { useInsightComposer } from './.ts'

const InsightComposer = ({ onSend }: { onSend: (text: string) => void }) => {
  const composer = useInsightComposer(onSend)

  return <div className="insight-composer sticky bottom-0 z-10 mt-auto flex flex-none items-end justify-center">
    <form onSubmit={composer.submit} className="insight-composer__field flex w-full items-end justify-between gap-2 rounded-lg py-3 pl-6 pr-3">
      <textarea
        rows={1}
        value={composer.draft}
        onChange={(event) => composer.setDraft(event.target.value)}
        onKeyDown={composer.handleKeyDown}
        placeholder="Write a message..."
        aria-label="Message"
        className="insight-composer__input min-w-0 flex-1 self-center bg-transparent outline-none"
      />
      <button type="submit" disabled={!composer.canSend} className="insight-composer__send flex flex-none items-center rounded-md p-1.5" aria-label="Send message">
        <span className="material-symbols-outlined text-2xl leading-none">arrow_forward</span>
      </button>
    </form>
  </div>
}

export default InsightComposer
