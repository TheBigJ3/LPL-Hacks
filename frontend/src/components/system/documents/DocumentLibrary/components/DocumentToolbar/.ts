import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'

const DOCUMENT_SEARCH_PARAM = 'q'

export function useDocumentToolbar(query: string) {
  const [, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState(query)
  const [appliedQuery, setAppliedQuery] = useState(query)

  if (query !== appliedQuery) {
    setAppliedQuery(query)
    setDraft(query)
  }

  const apply = (value: string) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      if (value) next.set(DOCUMENT_SEARCH_PARAM, value)
      else next.delete(DOCUMENT_SEARCH_PARAM)
      return next
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    apply(draft.trim())
  }

  // Leaving the field searches whatever is in it, same as pressing Enter.
  const blur = () => {
    if (draft.trim() !== query) apply(draft.trim())
  }

  const clear = () => {
    setDraft('')
    apply('')
  }

  return {
    draft,
    setDraft,
    showClear: !!query && draft.trim() === query,
    submit,
    blur,
    clear,
  }
}
