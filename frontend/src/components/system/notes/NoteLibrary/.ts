import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { Variants } from 'motion/react'
import { SIDEBAR_DEMO_CLIENTS, type SidebarClient } from '@components/template/Sidebar/.ts'

export type NoteColor = 'yellow' | 'pink' | 'mint' | 'blue' | 'mauve' | 'gray'

export type NoteView = 'grid' | 'list'

export type NoteSearch = {
  draft: string
  setDraft: (value: string) => void
  showClear: boolean
  submit: (event: FormEvent) => void
  blur: () => void
  clear: () => void
}

export type NoteDraft = {
  title: string
  html: string
  color: NoteColor
  memberId: string | null
}

export type NoteMemberOption = {
  id: string | null
  label: string
}

export type NoteSaved = NoteDraft & {
  text: string
}

export type NoteCardView = {
  id: string
  member: string
  memberInitial: string
  title: string
  body: string
  date: string
  color: NoteColor
}

type NoteRecord = {
  id: string
  clientId: string
  memberId: string | null
  title: string
  body: string
  html: string
  createdAt: Date
  color: NoteColor
}

const NOTE_UNTITLED = 'Untitled note'

export const NOTE_COLOR_OPTIONS: { color: NoteColor; label: string }[] = [
  { color: 'yellow', label: 'Yellow' },
  { color: 'pink', label: 'Pink' },
  { color: 'mint', label: 'Mint' },
  { color: 'blue', label: 'Blue' },
  { color: 'mauve', label: 'Mauve' },
  { color: 'gray', label: 'Gray' },
]

const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'mint', 'blue', 'mauve', 'blue', 'yellow', 'gray']

const NOTE_DEMO_CONTENT: [string, string][] = [
  ['Mr. Johnson has a couple key notes to go over next meeting.', 'Wants to revisit the Roth conversion plan and confirm the beneficiary updates on the IRA before year end.'],
  ['Follow up on 2025 tax documents', 'Still missing the 1099-B from the brokerage account and the K-1 from the rental partnership.'],
  ['College savings for the kids', 'Discussed bumping 529 contributions once the mortgage refinance closes. Run projections for both plans.'],
  ['Estate plan review', 'Trust was last updated in 2019. Suggest a meeting with their attorney to review successor trustees.'],
  ['Insurance coverage check', 'Umbrella policy may be under-insured after the home purchase. Request current declarations page.'],
  ['Rebalance before Q4', 'Equity allocation drifted to 72%. Target is 65/35; harvest losses in the taxable account first.'],
  ['RMD reminder', 'First required minimum distribution due next year. Confirm withholding preference.'],
  ['Cash flow questions', 'Asked about setting up a monthly ACH from the brokerage account to cover living expenses.'],
]

const NOTE_DEMO_OWNERS: [string, string | null][] = [
  ['johnson', null], ['johnson', 'jess'], ['patel', null], ['johnson', 'michelle'],
  ['dana-whitfield', null], ['johnson', 'adam'], ['nguyen', 'linh'], ['johnson', null],
  ['marcus-reed', null], ['johnson', 'kim'], ['garcia', 'sofia'], ['patel', 'priya'],
  ['elena-rossi', null], ['kenji-sato', null], ['nguyen', null], ['garcia', null],
]

const NOTE_DEMO_PER_OWNER = 3

const NOTE_DAY_MS = 86_400_000
const NOTE_DEMO_LATEST = Date.UTC(2026, 8, 24, 22, 36)

const NOTE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
const NOTE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

const NOTE_SEARCH_PARAM = 'q'
const NOTE_VIEW_PARAM = 'view'

export const NOTE_LIBRARY_EASE = [0.16, 1, 0.3, 1] as const

export const NOTE_LIBRARY_ENTRY_VARIANTS: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2, ease: 'easeInOut', staggerChildren: 0.03 } },
  exit: { opacity: 0, transition: { duration: 0.14, ease: 'easeInOut' } },
}

export const NOTE_ITEM_ENTRY_VARIANTS: Variants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0, transition: { duration: 0.28, ease: NOTE_LIBRARY_EASE } },
}

export const NOTE_LIBRARY_VIEW_VARIANTS: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.2, ease: 'easeInOut' } },
  exit: { opacity: 0, transition: { duration: 0.14, ease: 'easeInOut' } },
}

const NOTE_DEMO_RECORDS: NoteRecord[] = Array.from({ length: NOTE_DEMO_OWNERS.length * NOTE_DEMO_PER_OWNER }, (_, index) => {
  const [clientId, memberId] = NOTE_DEMO_OWNERS[index % NOTE_DEMO_OWNERS.length]
  const [title, body] = NOTE_DEMO_CONTENT[(index * 3) % NOTE_DEMO_CONTENT.length]
  return {
    id: `note-${index + 1}`,
    clientId,
    memberId,
    title,
    body,
    html: `<p>${body}</p>`,
    createdAt: new Date(NOTE_DEMO_LATEST - index * NOTE_DAY_MS),
    color: NOTE_COLORS[index % NOTE_COLORS.length],
  }
})

const noteFormatDate = (date: Date) => `${NOTE_DATE_FORMAT.format(date)} ${NOTE_TIME_FORMAT.format(date).replace(' ', '').toLowerCase()}`

const noteGetMemberLabel = (record: NoteRecord, client: SidebarClient | null) =>
  client?.members.find((member) => member.id === record.memberId)?.name ?? client?.name ?? 'Household'

const noteBuildCard = (record: NoteRecord, client: SidebarClient | null): NoteCardView => {
  const member = noteGetMemberLabel(record, client)
  return {
    id: record.id,
    member,
    memberInitial: member.charAt(0).toUpperCase(),
    title: record.title,
    body: record.body,
    date: noteFormatDate(record.createdAt),
    color: record.color,
  }
}

const noteMatchesQuery = (record: NoteRecord, client: SidebarClient | null, needle: string) =>
  [record.title, record.body, noteGetMemberLabel(record, client)].some((field) => field.toLowerCase().includes(needle))

export function useNoteLibrary() {
  const { clientId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const memberId = searchParams.get('member')
  const query = (searchParams.get(NOTE_SEARCH_PARAM) ?? '').trim()
  const client = SIDEBAR_DEMO_CLIENTS.find((item) => item.id === clientId) ?? null
  const view: NoteView = searchParams.get(NOTE_VIEW_PARAM) === 'list' ? 'list' : 'grid'

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorStartsEditing, setEditorStartsEditing] = useState(false)
  const [editorSession, setEditorSession] = useState(0)
  const [seenViews, setSeenViews] = useState<NoteView[]>([view])
  const [staggerView, setStaggerView] = useState<NoteView | null>(view)
  const [records, setRecords] = useState(NOTE_DEMO_RECORDS)
  const [viewedClientId, setViewedClientId] = useState(clientId)
  if (clientId !== viewedClientId) {
    setViewedClientId(clientId)
    setSeenViews([view])
    setStaggerView(view)
    setEditorOpen(false)
  }

  const [draft, setDraft] = useState(query)
  const [appliedQuery, setAppliedQuery] = useState(query)
  if (query !== appliedQuery) {
    setAppliedQuery(query)
    setDraft(query)
  }

  const nextIdRef = useRef(1)

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [clientId, memberId])

  const updateParam = (key: string, value: string | null) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  const applySearch = (value: string) => updateParam(NOTE_SEARCH_PARAM, value || null)

  const scoped = records.filter((record) => record.clientId === clientId && (!memberId || record.memberId === memberId))
  const visible = query ? scoped.filter((record) => noteMatchesQuery(record, client, query.toLowerCase())) : scoped

  const editing = editingId ? scoped.find((record) => record.id === editingId) ?? null : null

  const openEditor = (id: string | null, startsEditing: boolean) => {
    setEditingId(id)
    setEditorStartsEditing(startsEditing)
    setEditorSession((session) => session + 1)
    setEditorOpen(true)
  }

  // Demo only: notes live in memory until a notes API exists.
  const saveNote = (saved: NoteSaved) => {
    const fields = { title: saved.title.trim() || NOTE_UNTITLED, body: saved.text.trim(), html: saved.html, color: saved.color, memberId: saved.memberId }
    if (!clientId) return
    if (editing) {
      setRecords((current) => current.map((record) => record.id === editing.id ? { ...record, ...fields } : record))
    } else {
      const id = `${clientId}-new-${nextIdRef.current++}`
      setRecords((current) => [{
        id,
        clientId,
        ...fields,
        createdAt: new Date(),
      }, ...current])
      if (query) applySearch('')
    }
  }

  return {
    clientSelected: !!clientId,
    view,
    setView: (next: NoteView) => {
      if (next === view) return
      setStaggerView(seenViews.includes(next) ? null : next)
      setSeenViews((current) => current.includes(next) ? current : [...current, next])
      updateParam(NOTE_VIEW_PARAM, next === 'grid' ? null : next)
    },
    sectionVariants: staggerView === view ? NOTE_LIBRARY_ENTRY_VARIANTS : NOTE_LIBRARY_VIEW_VARIANTS,
    itemVariants: staggerView === view ? NOTE_ITEM_ENTRY_VARIANTS : undefined,
    notes: visible.map((record) => noteBuildCard(record, client)),
    query,
    search: <NoteSearch>{
      draft,
      setDraft,
      showClear: !!query && draft.trim() === query,
      submit: (event: FormEvent) => {
        event.preventDefault()
        applySearch(draft.trim())
      },
      blur: () => {
        if (draft.trim() !== query) applySearch(draft.trim())
      },
      clear: () => {
        setDraft('')
        applySearch('')
      },
    },
    createNote: () => openEditor(null, true),
    editNote: (id: string) => openEditor(id, true),
    viewNote: (id: string) => openEditor(id, false),
    editor: {
      open: editorOpen,
      key: editorSession,
      startsEditing: editorStartsEditing,
      draft: <NoteDraft>{
        title: editing?.title ?? '',
        html: editing?.html ?? '',
        color: editing?.color ?? NOTE_COLORS[scoped.length % NOTE_COLORS.length],
        memberId: editing ? editing.memberId : memberId,
      },
      members: <NoteMemberOption[]>[
        { id: null, label: client?.name ?? 'Household' },
        ...(client?.members.map((member) => ({ id: member.id, label: member.name })) ?? []),
      ],
      save: saveNote,
      close: () => setEditorOpen(false),
    },
    deleteNote: (id: string) => setRecords((current) => current.filter((record) => record.id !== id)),
    empty: query
      ? { title: `No notes match “${query}”`, subtitle: 'Try a different search' }
      : { title: 'No notes yet', subtitle: 'Create one to get started' },
  }
}
