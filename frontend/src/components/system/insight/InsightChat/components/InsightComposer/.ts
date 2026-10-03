import { useState, type FormEvent, type KeyboardEvent } from 'react'

export function useInsightComposer(busy: boolean, onSend: (text: string) => Promise<boolean>) {
  const [draft, setDraft] = useState('')
  const canSend = !!draft.trim() && !busy

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSend) return
    const text = draft.trim()
    setDraft('')
    if (!(await onSend(text))) setDraft((current) => current || text)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    void submit(event)
  }

  return { draft, setDraft, canSend, submit, handleKeyDown }
}
