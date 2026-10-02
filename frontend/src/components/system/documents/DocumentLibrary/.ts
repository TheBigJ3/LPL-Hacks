import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { Variants } from 'motion/react'
import { useElementWidth } from '@hooks/useElementWidth'
import documentPreview from '@assets/documents/document-preview.png'

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

type DocumentTag = {
  id: string
  label: string
}

type DocumentRecord = {
  id: string
  name: string
  tagId: string
  clientId: string
  memberId: string | null
  uploadedAt: Date
}

const DOCUMENT_TAGS: DocumentTag[] = [
  { id: 'account-opening', label: 'Account opening and agreements' },
  { id: 'tax-forms', label: 'Tax forms' },
  { id: 'moving-money', label: 'Moving money' },
  { id: 'statements', label: 'Statements' },
  { id: 'estate-planning', label: 'Estate planning' },
  { id: 'insurance', label: 'Insurance' },
]

const DOCUMENT_DEMO_NAMES: Record<string, string[]> = {
  'account-opening': [
    'New account application', 'Advisory agreement', 'Form CRS acknowledgment', 'Beneficiary designation',
    'IRA adoption agreement', 'Margin agreement', 'Transfer on death agreement', 'Trusted contact form',
  ],
  'tax-forms': [
    'W-9 (US persons)', 'Form 1040', 'Form 1099-DIV', 'Form 1099-B', 'Form 1099-INT', 'Form 1099-R',
    'W-2 wage statement', 'Form 5498', 'Schedule K-1', 'Form 8606', 'Form 1098 mortgage interest', 'Pay stub',
  ],
  'moving-money': ['ACH authorization', 'Wire transfer request', 'Standing letter of authorization', 'Distribution request', 'Journal request'],
  'statements': ['Brokerage statement', 'IRA statement', 'Roth IRA statement', '401(k) statement', 'Annuity statement', 'Trade confirmation'],
  'estate-planning': ['Revocable living trust', 'Last will and testament', 'Durable power of attorney', 'Healthcare directive'],
  'insurance': ['Life insurance policy', 'Long-term care policy', 'Umbrella policy'],
}

const DOCUMENT_DEMO_COUNTS: Record<string, number> = {
  'account-opening': 18,
  'tax-forms': 40,
  'moving-money': 12,
  'statements': 30,
  'estate-planning': 6,
  'insurance': 4,
}

const DOCUMENT_DEMO_OWNERS: [string, string | null][] = [
  ['johnson', null], ['johnson', 'jess'], ['patel', null], ['johnson', 'michelle'],
  ['dana-whitfield', null], ['johnson', 'adam'], ['nguyen', 'linh'], ['johnson', null],
  ['marcus-reed', null], ['johnson', 'kim'], ['garcia', 'sofia'], ['patel', 'priya'],
  ['elena-rossi', null], ['kenji-sato', null], ['nguyen', null], ['garcia', null],
]

const DOCUMENT_DEMO_LATEST = Date.UTC(2026, 8, 30)
const DOCUMENT_DAY_MS = 86_400_000

const DOCUMENT_DEMO_RECORDS: DocumentRecord[] = DOCUMENT_TAGS.flatMap((tag, tagIndex) =>
  Array.from({ length: DOCUMENT_DEMO_COUNTS[tag.id] }, (_, index) => {
    const names = DOCUMENT_DEMO_NAMES[tag.id]
    const [clientId, memberId] = DOCUMENT_DEMO_OWNERS[(index + tagIndex * 3) % DOCUMENT_DEMO_OWNERS.length]
    return {
      id: `${tag.id}-${index + 1}`,
      name: names[index % names.length],
      tagId: tag.id,
      clientId,
      memberId,
      uploadedAt: new Date(DOCUMENT_DEMO_LATEST - (index * 5 + tagIndex * 2) * DOCUMENT_DAY_MS),
    }
  })
)

const DOCUMENT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const DOCUMENT_CARD_MIN_WIDTH = 168
const DOCUMENT_WIDE_WIDTH = 900
const DOCUMENT_GAP_WIDE = 36
const DOCUMENT_GAP_NARROW = 20
const DOCUMENT_MIN_COLUMNS = 2
const DOCUMENT_MAX_COLUMNS = 5

export const DOCUMENT_LIBRARY_VIEW_VARIANTS: Variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.05 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16, ease: 'easeIn' } },
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

const documentMatchesQuery = (record: DocumentRecord, needle: string) => {
  const tag = DOCUMENT_TAGS.find((item) => item.id === record.tagId)
  return record.name.toLowerCase().includes(needle) || !!tag?.label.toLowerCase().includes(needle)
}

const documentToCard = (record: DocumentRecord, memberSearch: string): DocumentCardView => ({
  id: record.id,
  name: record.name,
  date: DOCUMENT_DATE_FORMAT.format(record.uploadedAt),
  thumbnail: documentPreview,
  href: `/clients/${record.clientId}/documents/${record.id}${memberSearch}`,
})

export function useDocumentLibrary() {
  const { clientId } = useParams()
  const [searchParams] = useSearchParams()
  const [measureRef, width] = useElementWidth<HTMLDivElement>()

  const memberId = searchParams.get('member')
  const tag = DOCUMENT_TAGS.find((item) => item.id === searchParams.get('tag')) ?? null
  const query = (searchParams.get('q') ?? '').trim()
  const memberSearch = memberId ? `?member=${memberId}` : ''
  const viewKey = [clientId, memberId, tag?.id, query].join('|')

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [viewKey])

  const scoped = DOCUMENT_DEMO_RECORDS.filter((record) => record.clientId === clientId && (!memberId || record.memberId === memberId))
  const searched = query ? scoped.filter((record) => documentMatchesQuery(record, query.toLowerCase())) : scoped
  const countFor = (tagId: string) => searched.filter((record) => record.tagId === tagId).length

  const tagOptions: DocumentTagOption[] = [
    { key: 'all', label: 'All', count: searched.length, selected: !tag, href: documentBuildSearch(searchParams, { tag: null }) },
    ...DOCUMENT_TAGS
      .map((item) => ({
        key: item.id,
        label: item.label,
        count: countFor(item.id),
        selected: item.id === tag?.id,
        href: documentBuildSearch(searchParams, { tag: item.id }),
      }))
      .filter((option) => option.count > 0 || option.selected),
  ]

  const mode: DocumentSectionMode = tag || query ? 'list' : 'preview'
  const listRecords = tag ? searched.filter((record) => record.tagId === tag.id) : searched

  const sections: DocumentSectionView[] = mode === 'list'
    ? [{
      key: tag?.id ?? 'results',
      title: tag?.label ?? 'Search results',
      total: listRecords.length,
      documents: listRecords.map((record) => documentToCard(record, memberSearch)),
      seeAllHref: null,
    }].filter((section) => section.total > 0)
    : DOCUMENT_TAGS
      .map((item) => {
        const records = searched.filter((record) => record.tagId === item.id)
        return {
          key: item.id,
          title: item.label,
          total: records.length,
          documents: records.map((record) => documentToCard(record, memberSearch)),
          seeAllHref: documentBuildSearch(searchParams, { tag: item.id }),
        }
      })
      .filter((section) => section.total > 0)

  return {
    clientSelected: !!clientId,
    measureRef,
    columns: documentGetColumns(width),
    wide: width >= DOCUMENT_WIDE_WIDTH,
    query,
    mode,
    viewKey,
    tagOptions,
    sections,
    empty: query
      ? { title: `No documents match “${query}”`, subtitle: 'Try a different search or tag' }
      : { title: 'No documents yet', subtitle: 'Upload one to get started' },
    uploadHref: `/clients/${clientId}/upload${memberSearch}`,
  }
}
