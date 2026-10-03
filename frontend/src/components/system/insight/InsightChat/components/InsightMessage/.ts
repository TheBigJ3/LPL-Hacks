import { useState } from 'react'
import type { InsightCitation, InsightMessage } from '@lpl-hacks/shared/src/types/native/insight/insightMessage'

const INSIGHT_MESSAGE_COPIED_MS = 1500
const INSIGHT_INLINE_PATTERN = /(\*\*[^*]+\*\*|\[S\d+\]|`[^`]+`|(?<![*\w])\*[^*\n]+\*(?![*\w]))/g
const INSIGHT_LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/

export type InsightSegment =
  | { kind: 'text', text: string }
  | { kind: 'bold', text: string }
  | { kind: 'italic', text: string }
  | { kind: 'code', text: string }
  | { kind: 'citation', sourceId: string, number: number | null, label: string }

export type InsightBlock =
  | { kind: 'paragraph', key: string, segments: InsightSegment[] }
  | { kind: 'list', key: string, items: InsightSegment[][] }

export type InsightSourceView = {
  sourceId: string
  number: number
  domId: string
  icon: string
  title: string
  detail: string
  badge: 'verified' | 'unverified' | 'note'
  badgeLabel: string
  quote: string
}

function insightCitationLabel(citation: InsightCitation): string {
  const name = citation.fileName ?? (citation.sourceType === 'note' ? 'Advisor note' : 'Document')
  return citation.page === null ? name : `${name}, page ${citation.page}`
}

function insightBuildSegments(line: string, numbers: Map<string, number>, citations: Map<string, InsightCitation>): InsightSegment[] {
  return line.split(INSIGHT_INLINE_PATTERN).filter(Boolean).map((part): InsightSegment => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { kind: 'bold', text: part.slice(2, -2) }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return { kind: 'code', text: part.slice(1, -1) }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return { kind: 'italic', text: part.slice(1, -1) }
    const citation = /^\[(S\d+)\]$/.exec(part)
    if (!citation) return { kind: 'text', text: part }
    const sourceId = citation[1]!
    const known = citations.get(sourceId)
    return { kind: 'citation', sourceId, number: numbers.get(sourceId) ?? null, label: known ? insightCitationLabel(known) : 'Source' }
  })
}

export function insightBuildBlocks(text: string, citations: InsightCitation[]): InsightBlock[] {
  const numbers = new Map(citations.map((citation, index) => [citation.sourceId, index + 1]))
  const byId = new Map(citations.map((citation) => [citation.sourceId, citation]))
  const blocks: InsightBlock[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', key: `p${blocks.length}`, segments: insightBuildSegments(paragraph.join(' '), numbers, byId) })
    paragraph = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'list', key: `l${blocks.length}`, items: list.map((item) => insightBuildSegments(item, numbers, byId)) })
    list = []
  }

  for (const line of text.split('\n')) {
    if (!line.trim()) {
      flushParagraph()
      flushList()
    } else if (INSIGHT_LIST_ITEM.test(line)) {
      flushParagraph()
      list.push(line.replace(INSIGHT_LIST_ITEM, ''))
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  flushList()
  return blocks
}

function insightBuildSources(message: InsightMessage): InsightSourceView[] {
  return message.citations.map((citation, index) => ({
    sourceId: citation.sourceId,
    number: index + 1,
    domId: `insight-source-${message.id}-${index + 1}`,
    icon: citation.sourceType === 'note' ? 'sticky_note_2' : 'description',
    title: citation.fileName ?? (citation.sourceType === 'note' ? 'Advisor note' : 'Document'),
    detail: citation.sourceType === 'note' ? 'Your note' : citation.page === null ? 'Document' : `Page ${citation.page}`,
    badge: citation.sourceType === 'note' ? 'note' : citation.verified ? 'verified' : 'unverified',
    badgeLabel: citation.sourceType === 'note' ? 'Advisor note' : citation.verified ? 'Verified' : 'Unverified',
    quote: citation.quote,
  }))
}

function insightPlainText(text: string): string {
  return text.replace(/\s*\[S\d+\]/g, '').replace(/\*\*|`/g, '')
}

export function useInsightMessage(message: InsightMessage) {
  const [copied, setCopied] = useState(false)
  const sources = insightBuildSources(message)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(insightPlainText(message.text))
      setCopied(true)
      setTimeout(() => setCopied(false), INSIGHT_MESSAGE_COPIED_MS)
    } catch {
      setCopied(false)
    }
  }

  const showSource = (sourceId: string) => {
    const source = sources.find((entry) => entry.sourceId === sourceId)
    const element = source ? document.getElementById(source.domId) : null
    if (!element) return
    element.setAttribute('open', '')
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    element.querySelector('summary')?.focus({ preventScroll: true })
  }

  return {
    copied,
    copy,
    showSource,
    isUser: message.role === 'user',
    thinking: message.status === 'pending' || (message.status === 'streaming' && !message.text),
    streaming: message.status === 'streaming' && !!message.text,
    failed: message.status === 'failed',
    complete: message.status === 'complete',
    blocks: insightBuildBlocks(message.text, message.citations),
    sources,
  }
}
