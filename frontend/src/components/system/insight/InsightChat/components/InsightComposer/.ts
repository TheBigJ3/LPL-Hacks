import { useState, type FormEvent, type KeyboardEvent } from 'react'

export function useInsightComposer(onSend: (text: string) => void) {
  const [draft, setDraft] = useState('')
  const canSend = !!draft.trim()

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSend) return
    onSend(draft.trim())
    setDraft('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    submit(event)
  }

  return { draft, setDraft, canSend, submit, handleKeyDown }
}
