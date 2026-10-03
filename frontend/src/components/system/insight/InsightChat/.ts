import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { InsightMessage } from '@lpl-hacks/shared/src/types/native/insight/insightMessage'
import type { Response as InsightGetResponse } from '@lpl-hacks/shared/src/types/native/api/v1/insight/get'
import insightProgress from '@lpl-hacks/shared/src/types/native/sockets/insight/progress'
import insightSettled from '@lpl-hacks/shared/src/types/native/sockets/insight/settled'
import insightWatch from '@lpl-hacks/shared/src/types/native/sockets/insight/watch'
import listClientsApi from '@api/clients/listClientsApi'
import askInsightApi from '@api/insight/askInsightApi'
import getInsightApi from '@api/insight/getInsightApi'
import listInsightApi from '@api/insight/listInsightApi'
import { apiPostRequest, useApiGetQuery } from '@features/apiLayer'
import { queryClient } from '@features/queryClient'
import { socketWatch, useSocketEvent } from '@stores/socketStore'
import { INSIGHT_ERRORS } from '@typings/native/insight/errors'

const INSIGHT_CHAT_PARAM = 'chat'
const INSIGHT_OPEN_POLL_MS = 4_000
const INSIGHT_SCROLL_FOLLOW_PX = 160

function insightIsOpen(message: InsightMessage): boolean {
  return message.status === 'pending' || message.status === 'streaming'
}

export type InsightChatListItem = {
  id: string
  title: string
  href: string
  selected: boolean
}

function insightChatHref(searchParams: URLSearchParams, chatId: string | null): string {
  const next = new URLSearchParams(searchParams)
  if (chatId) next.set(INSIGHT_CHAT_PARAM, chatId)
  else next.delete(INSIGHT_CHAT_PARAM)
  const query = next.toString()
  return query ? `?${query}` : '?'
}

function insightScrollParent(element: HTMLElement | null): HTMLElement | null {
  return element?.closest('main') ?? null
}

export function useInsightChat() {
  const { clientId: clientSlug } = useParams()
  const clientsQuery = useApiGetQuery(listClientsApi)
  const client = clientsQuery.data?.clients.find((item) => item.slug === clientSlug) ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  const chatId = searchParams.get(INSIGHT_CHAT_PARAM)
  const listParams = { clientId: client?.id ?? '' }
  const params = { clientId: client?.id ?? '', conversationId: chatId ?? '' }

  const [live, setLive] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [viewedChatId, setViewedChatId] = useState(chatId)
  if (chatId !== viewedChatId) {
    setViewedChatId(chatId)
    setError(null)
  }
  const [end, setEnd] = useState<HTMLDivElement | null>(null)
  const [following, setFollowing] = useState(true)

  const listQuery = useApiGetQuery(listInsightApi, listParams, { enabled: !!client })
  const conversationQuery = useApiGetQuery(getInsightApi, params, {
    enabled: !!client && !!chatId,
    refetchInterval: (query) => query.state.data?.conversation?.messages.some(insightIsOpen) ? INSIGHT_OPEN_POLL_MS : false,
  })
  const conversation = chatId ? conversationQuery.data?.conversation ?? null : null
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
    void queryClient.invalidateQueries({ queryKey: [listInsightApi.identifier, listParams] })
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
    const nextParams = { clientId: client.id, conversationId: res.data.conversationId }
    queryClient.setQueryData<InsightGetResponse>([getInsightApi.identifier, nextParams], (current) => ({
      success: true,
      conversation: {
        id: res.data.conversationId,
        clientId: client.id,
        messages: [...(current?.conversation.messages ?? []), ...res.data.messages],
      },
    }))
    void queryClient.invalidateQueries({ queryKey: [listInsightApi.identifier, listParams] })
    if (res.data.conversationId !== chatId) setSearchParams(insightChatHref(searchParams, res.data.conversationId).slice(1))
    return true
  }

  const chats: InsightChatListItem[] = (listQuery.data?.conversations ?? []).map((summary) => ({
    id: summary.id,
    title: summary.title,
    href: insightChatHref(searchParams, summary.id),
    selected: summary.id === chatId,
  }))

  return {
    clientSelected: !!clientSlug,
    chats,
    newChatHref: insightChatHref(searchParams, null),
    newChatSelected: !chatId,
    loading: clientsQuery.isPending || (!!client && !!chatId && conversationQuery.isPending),
    loadError: conversationQuery.isError ? INSIGHT_ERRORS.LOAD_FAILED.MESSAGE : null,
    error,
    messages,
    busy,
    setEnd,
    send,
  }
}
