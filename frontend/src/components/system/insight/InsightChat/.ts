import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import type { InsightMessage } from '@lpl-hacks/shared/src/types/native/insight/insightMessage'
import type { Response as InsightGetResponse } from '@lpl-hacks/shared/src/types/native/api/v1/insight/get'
import insightProgress from '@lpl-hacks/shared/src/types/native/sockets/insight/progress'
import insightSettled from '@lpl-hacks/shared/src/types/native/sockets/insight/settled'
import insightWatch from '@lpl-hacks/shared/src/types/native/sockets/insight/watch'
import listClientsApi from '@api/clients/listClientsApi'
import askInsightApi from '@api/insight/askInsightApi'
import getInsightApi from '@api/insight/getInsightApi'
import { apiPostRequest, useApiGetQuery } from '@features/apiLayer'
import { queryClient } from '@features/queryClient'
import { socketWatch, useSocketEvent } from '@stores/socketStore'
import { INSIGHT_ERRORS } from '@typings/native/insight/errors'

const INSIGHT_OPEN_POLL_MS = 4_000
const INSIGHT_SCROLL_FOLLOW_PX = 160

function insightIsOpen(message: InsightMessage): boolean {
  return message.status === 'pending' || message.status === 'streaming'
}

function insightScrollParent(element: HTMLElement | null): HTMLElement | null {
  return element?.closest('main') ?? null
}

export function useInsightChat() {
  const { clientId: clientSlug } = useParams()
  const clientsQuery = useApiGetQuery(listClientsApi)
  const client = clientsQuery.data?.clients.find((item) => item.slug === clientSlug) ?? null
  const params = { clientId: client?.id ?? '' }

  const [live, setLive] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [end, setEnd] = useState<HTMLDivElement | null>(null)
  const [following, setFollowing] = useState(true)

  const conversationQuery = useApiGetQuery(getInsightApi, params, {
    enabled: !!client,
    refetchInterval: (query) => query.state.data?.conversation?.messages.some(insightIsOpen) ? INSIGHT_OPEN_POLL_MS : false,
  })
  const conversation = conversationQuery.data?.conversation ?? null
  const conversationId = conversation?.id ?? null

  useEffect(() => {
    if (!conversationId) return
    return socketWatch(insightWatch, { conversationId })
  }, [conversationId])

  useSocketEvent(insightProgress, (payload) => {
    if (payload.conversationId !== conversationId) return
    setLive((current) => ({ ...current, [payload.messageId]: payload.text }))
  })

  useSocketEvent(insightSettled, (payload) => {
    if (payload.conversationId !== conversationId) return
    void queryClient.invalidateQueries({ queryKey: [getInsightApi.identifier, params] })
  })

  const messages = (conversation?.messages ?? []).map((message) => insightIsOpen(message) && live[message.id] !== undefined
    ? { ...message, text: live[message.id]! }
    : message)
  const busy = sending || messages.some(insightIsOpen)
  const lastText = messages.at(-1)?.text ?? ''
  const lastStatus = messages.at(-1)?.status ?? null

  useEffect(() => {
    const scroller = insightScrollParent(end)
    if (!scroller) return
    const track = () => setFollowing(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < INSIGHT_SCROLL_FOLLOW_PX)
    scroller.addEventListener('scroll', track, { passive: true })
    return () => scroller.removeEventListener('scroll', track)
  }, [end])

  useEffect(() => {
    end?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [end, messages.length])

  useEffect(() => {
    const scroller = insightScrollParent(end)
    if (scroller && following) scroller.scrollTop = scroller.scrollHeight
  }, [end, following, lastText, lastStatus])

  async function send(text: string): Promise<boolean> {
    if (!client || busy) return false
    setSending(true)
    setError(null)
    const res = await apiPostRequest(askInsightApi, { clientId: client.id, conversationId: conversationId ?? undefined, message: text })
    setSending(false)
    if (!res.success) {
      setError(res.error.message)
      return false
    }
    queryClient.setQueryData<InsightGetResponse>([getInsightApi.identifier, params], (current) => ({
      success: true,
      conversation: {
        id: res.data.conversationId,
        clientId: client.id,
        messages: [...(current?.conversation?.id === res.data.conversationId ? current.conversation.messages : []), ...res.data.messages],
      },
    }))
    return true
  }

  return {
    clientSelected: !!clientSlug,
    loading: clientsQuery.isPending || (!!client && conversationQuery.isPending),
    loadError: conversationQuery.isError ? INSIGHT_ERRORS.LOAD_FAILED.MESSAGE : null,
    error,
    messages,
    busy,
    setEnd,
    send,
  }
}
