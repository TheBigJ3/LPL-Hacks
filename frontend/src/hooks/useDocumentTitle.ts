import { useEffect } from 'react'

const DOCUMENT_TITLE_APP_NAME = 'Backbone'

export function useDocumentTitle(...parts: (string | null | undefined)[]) {
  const title = [...parts.filter(Boolean), DOCUMENT_TITLE_APP_NAME].join(' · ')

  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
