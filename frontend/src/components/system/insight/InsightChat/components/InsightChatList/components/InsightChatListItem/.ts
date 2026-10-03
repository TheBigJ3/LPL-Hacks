import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { InsightChatActions, InsightChatListItem } from '../../../../.ts'

export function useInsightChatListItem(chat: InsightChatListItem, actions: InsightChatActions) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(chat.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const startEditing = () => {
    setDraft(chat.title)
    setEditing(true)
  }

  const save = (event?: FormEvent) => {
    event?.preventDefault()
    if (!editing) return
    setEditing(false)
    actions.rename(chat.id, draft)
  }

  const cancelOnEscape = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    setEditing(false)
  }

  return {
    editing,
    draft,
    setDraft,
    inputRef,
    save,
    cancelOnEscape,
    startEditing,
    togglePin: () => actions.togglePin(chat.id),
    remove: () => actions.remove(chat.id),
  }
}
