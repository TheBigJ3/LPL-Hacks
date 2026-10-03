import './.css'
import { useInsightComposer } from './.ts'

const InsightComposer = ({ busy, error, onSend }: { busy: boolean; error: string | null; onSend: (text: string) => Promise<boolean> }) => {
  const composer = useInsightComposer(busy, onSend)

  return <div className="insight-composer sticky bottom-0 z-10 mt-auto flex flex-none flex-col items-center justify-end gap-2">
    {error && <p className="insight-composer__error w-full rounded-lg px-4 py-2" role="alert">{error}</p>}
    <form onSubmit={(event) => void composer.submit(event)} className="insight-composer__field flex w-full items-end justify-between gap-2 rounded-lg py-3 pl-6 pr-3">
      <textarea
        rows={1}
        value={composer.draft}
        onChange={(event) => composer.setDraft(event.target.value)}
        onKeyDown={composer.handleKeyDown}
        placeholder={busy ? "Answering…" : "Write a message..."}
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
