import { useState } from 'react'
import { useMatch } from 'react-router'

export type InsightMessageRole = 'user' | 'assistant'

export type InsightChatMessage = {
  id: string
  role: InsightMessageRole
  text: string
}

export function useInsightChat() {
  const clientMatch = useMatch('/clients/:clientId/*')
  const [messages, setMessages] = useState<InsightChatMessage[]>([])

  const send = (text: string) => {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }])
  }

  return {
    clientSelected: !!clientMatch,
    messages,
    send,
  }
}
