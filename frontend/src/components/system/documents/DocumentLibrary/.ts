import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { Variants } from 'motion/react'
import { useElementWidth } from '@hooks/useElementWidth'
import documentPreview from '@assets/documents/document-preview.png'
import type { DocumentListItem } from '@lpl-hacks/shared/src/types/native/documents/document'
import listClientsApi from '@api/clients/listClientsApi'
import listDocumentsApi from '@api/documents/listDocumentsApi'
import { useApiGetQuery } from '@features/apiLayer'
import { DOCUMENT_LIBRARY_ERRORS } from '@typings/native/documents/errors'
import type { OnboardingTourStep } from '@components/template/OnboardingTour/.ts'

export type DocumentCardView = {
  id: string
  name: string
  date: string
  thumbnail: string
  href: string
}

export type DocumentSectionView = {
  key: string
  title: string
  total: number
  documents: DocumentCardView[]
  seeAllHref: string | null
}

export type DocumentTagOption = {
  key: string
  label: string
  count: number
  selected: boolean
  href: string
}

export type DocumentSectionMode = 'preview' | 'list'

type DocumentTopic = {
  id: string
  label: string
}

const DOCUMENT_REVIEW_TOPIC: DocumentTopic = { id: 'needs-review', label: 'Needs review' }
const DOCUMENT_OTHER_TOPIC: DocumentTopic = { id: 'other', label: 'Other' }

const DOCUMENT_TOPIC_LABELS: Record<string, string> = {
  tax: 'Tax',
  income: 'Income',
  retirement: 'Retirement',
  investments: 'Investments',
  banking_cash: 'Banking & cash',
  self_employment: 'Self-employment',
  mortgage_housing: 'Mortgage & housing',
  health_savings: 'Health savings',
  insurance: 'Insurance',
}

const DOCUMENT_TOPIC_ORDER = Object.keys(DOCUMENT_TOPIC_LABELS)

const DOCUMENT_STATUS_LABELS = {
  extracting: 'Extracting',
  extractFailed: 'Extraction failed',
  review: 'Awaiting review',
  tagging: 'Tagging',
  tagFailed: 'Tagging failed',
} as const

const DOCUMENT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const DOCUMENT_CARD_MIN_WIDTH = 200
const DOCUMENT_WIDE_WIDTH = 900
const DOCUMENT_GAP_WIDE = 24
const DOCUMENT_GAP_NARROW = 24
const DOCUMENT_MIN_COLUMNS = 2
const DOCUMENT_MAX_COLUMNS = 4

let documentPreviewReady = false

export const DOCUMENT_LIBRARY_VIEW_VARIANTS: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.24, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } },
}

const documentGetColumns = (width: number) => {
  if (!width) return DOCUMENT_MAX_COLUMNS
  const gap = width >= DOCUMENT_WIDE_WIDTH ? DOCUMENT_GAP_WIDE : DOCUMENT_GAP_NARROW
  const fit = Math.floor((width + gap) / (DOCUMENT_CARD_MIN_WIDTH + gap))
  return Math.min(DOCUMENT_MAX_COLUMNS, Math.max(DOCUMENT_MIN_COLUMNS, fit))
}

const documentBuildSearch = (params: URLSearchParams, changes: Record<string, string | null>) => {
  const next = new URLSearchParams(params)
  Object.entries(changes).forEach(([key, value]) => {
    if (value) next.set(key, value)
    else next.delete(key)
  })
  const search = next.toString()
  return search ? `?${search}` : '?'
}

const documentTopicLabel = (topic: string) =>
  DOCUMENT_TOPIC_LABELS[topic] ?? topic.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())

const documentGetTopics = (record: DocumentListItem): DocumentTopic[] => {
  if (record.tagStatus !== 'tagged') return [DOCUMENT_REVIEW_TOPIC]
  const topics = [...new Set(record.tagging?.tags.map((tag) => tag.name) ?? [])]
  return topics.length ? topics.map((topic) => ({ id: topic, label: documentTopicLabel(topic) })) : [DOCUMENT_OTHER_TOPIC]
}

const documentCompareTopics = (a: DocumentTopic, b: DocumentTopic) => {
  const rank = (topic: DocumentTopic) => {
    if (topic.id === DOCUMENT_REVIEW_TOPIC.id) return -1
    if (topic.id === DOCUMENT_OTHER_TOPIC.id) return DOCUMENT_TOPIC_ORDER.length + 1
    const index = DOCUMENT_TOPIC_ORDER.indexOf(topic.id)
    return index === -1 ? DOCUMENT_TOPIC_ORDER.length : index
  }
  return rank(a) - rank(b) || a.label.localeCompare(b.label)
}

const documentGetStatusLabel = (record: DocumentListItem) => {
  if (record.status === 'failed') return DOCUMENT_STATUS_LABELS.extractFailed
  if (record.status !== 'extracted') return DOCUMENT_STATUS_LABELS.extracting
  if (record.tagStatus === 'pending') return DOCUMENT_STATUS_LABELS.tagging
  if (record.tagStatus === 'failed') return DOCUMENT_STATUS_LABELS.tagFailed
  return DOCUMENT_STATUS_LABELS.review
}

const documentMatchesQuery = (record: DocumentListItem, needle: string) =>
  record.fileName.toLowerCase().includes(needle) || documentGetTopics(record).some((topic) => topic.label.toLowerCase().includes(needle))

const documentFormatCount = (count: number) => `${count} ${count === 1 ? 'document' : 'documents'}`

const documentFormatSummary = (shown: number, total: number) =>
  shown === total ? documentFormatCount(total) : `${shown} of ${documentFormatCount(total)}`

const documentPreviewDecode = () => {
  const image = new Image()
  image.src = documentPreview
  return image.decode()
}

const documentToCard = (record: DocumentListItem, clientSlug: string): DocumentCardView => {
  const date = DOCUMENT_DATE_FORMAT.format(new Date(record.createdAt))
  return {
    id: record.id,
    name: record.fileName,
    date: record.tagStatus === 'tagged' ? date : `${documentGetStatusLabel(record)} · ${date}`,
    thumbnail: documentPreview,
    href: `/clients/${clientSlug}/extract?document=${record.id}`,
  }
}

export function useDocumentLibrary() {
  const { clientId: clientSlug } = useParams()
  const [searchParams] = useSearchParams()
  const [measureRef, width] = useElementWidth<HTMLDivElement>()
  const [previewReady, setPreviewReady] = useState(documentPreviewReady)
  const clientsQuery = useApiGetQuery(listClientsApi)
  const client = clientsQuery.data?.clients.find((item) => item.slug === clientSlug) ?? null
  const documentsQuery = useApiGetQuery(listDocumentsApi, { clientId: client?.id ?? '' }, { enabled: !!client })

  const memberSlug = searchParams.get('member')
  const member = client?.members.find((item) => item.slug === memberSlug) ?? null
  const query = (searchParams.get('q') ?? '').trim()
  const memberSearch = memberSlug ? `?member=${memberSlug}` : ''
  const viewKey = [clientSlug, memberSlug, searchParams.get('tag'), query].join('|')

  const lastViewKey = useRef(viewKey)

  useEffect(() => {
    if (previewReady) return
    const markReady = () => {
      documentPreviewReady = true
      setPreviewReady(true)
    }
    documentPreviewDecode().then(markReady, markReady)
  }, [previewReady])

  useEffect(() => {
    if (lastViewKey.current === viewKey) return
    lastViewKey.current = viewKey
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [viewKey])

  const records = documentsQuery.data?.documents ?? []
  const scoped = member ? records.filter((record) => record.tagging?.members.some((item) => item.memberId === member.id)) : records
  const searched = query ? scoped.filter((record) => documentMatchesQuery(record, query.toLowerCase())) : scoped

  const topics = [...new Map(searched.flatMap(documentGetTopics).map((topic) => [topic.id, topic])).values()].sort(documentCompareTopics)
  const recordsFor = (topicId: string) => searched.filter((record) => documentGetTopics(record).some((topic) => topic.id === topicId))
  const tagParam = searchParams.get('tag')
  const tag = topics.find((item) => item.id === tagParam) ?? (tagParam ? { id: tagParam, label: documentTopicLabel(tagParam) } : null)

  const tagOptions: DocumentTagOption[] = [
    { key: 'all', label: 'All', count: searched.length, selected: !tag, href: documentBuildSearch(searchParams, { tag: null }) },
    ...topics.map((item) => ({
      key: item.id,
      label: item.label,
      count: recordsFor(item.id).length,
      selected: item.id === tag?.id,
      href: documentBuildSearch(searchParams, { tag: item.id }),
    })),
  ]

  const mode: DocumentSectionMode = tag || query ? 'list' : 'preview'
  const listRecords = tag ? recordsFor(tag.id) : searched
  const toCard = (record: DocumentListItem) => documentToCard(record, clientSlug ?? '')

  const sections: DocumentSectionView[] = mode === 'list'
    ? [{
      key: tag?.id ?? 'results',
      title: tag?.label ?? 'Search results',
      total: listRecords.length,
      documents: listRecords.map(toCard),
      seeAllHref: null,
    }].filter((section) => section.total > 0)
    : topics.map((item) => {
      const topicRecords = recordsFor(item.id)
      return {
        key: item.id,
        title: item.label,
        total: topicRecords.length,
        documents: topicRecords.map(toCard),
        seeAllHref: documentBuildSearch(searchParams, { tag: item.id }),
      }
    })

  const shownCount = mode === 'list' ? listRecords.length : searched.length

  return {
    clientSelected: !!clientSlug,
    loading: !previewReady || clientsQuery.isPending || (!!client && documentsQuery.isPending),
    measureRef,
    columns: documentGetColumns(width),
    wide: width >= DOCUMENT_WIDE_WIDTH,
    query,
    mode,
    viewKey,
    tagOptions,
    sections,
    summary: shownCount ? documentFormatSummary(shownCount, scoped.length) : null,
    empty: documentsQuery.isError
      ? { title: DOCUMENT_LIBRARY_ERRORS.LOAD_FAILED.MESSAGE, subtitle: documentsQuery.error.message }
      : query
        ? { title: `No documents match “${query}”`, subtitle: 'Try a different search or tag' }
        : { title: 'No documents yet', subtitle: 'Upload one to get started' },
    uploadHref: `/clients/${clientSlug}/extract${memberSearch}`,
  }
}

export const DOCUMENT_LIBRARY_TOUR_STORAGE_KEY = 'onboarding:documents-seen'

export const DOCUMENT_LIBRARY_TOUR_STEPS: OnboardingTourStep[] = [
  {
    target: 'document-search',
    title: 'Search inside documents',
    body: 'Search the contents of every document for this client, not just file names.',
    placement: 'bottom',
  },
  {
    target: 'document-tags',
    title: 'Filter by tag',
    body: 'Narrow the library to a single tag, like a document type or tax year.',
    placement: 'bottom',
  },
  {
    target: 'document-upload',
    title: 'Upload a document',
    body: 'Add a new file. It is extracted, reviewed and tagged before it joins the library.',
    placement: 'bottom',
  },
  {
    target: 'document-list',
    title: 'Your filing cabinet',
    body: 'Every document for this client, grouped and tagged. Open one to see its extracted fields.',
    placement: 'top',
  },
]
