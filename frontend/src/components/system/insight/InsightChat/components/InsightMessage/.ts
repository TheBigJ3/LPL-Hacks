import { useState } from 'react'
import type { InsightChatMessage } from '../../.ts'

const INSIGHT_MESSAGE_COPIED_MS = 1500

export function useInsightMessage(message: InsightChatMessage) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopied(true)
      setTimeout(() => setCopied(false), INSIGHT_MESSAGE_COPIED_MS)
    } catch {
      setCopied(false)
    }
  }

  return { copied, copy, isUser: message.role === 'user' }
}
