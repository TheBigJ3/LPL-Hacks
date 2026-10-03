import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { Variants } from 'motion/react'
import type { Client } from '@lpl-hacks/shared/src/types/native/clients/client'
import type { Note, NoteColor } from '@lpl-hacks/shared/src/types/native/notes/note'
import type { Response as NoteListResponse } from '@lpl-hacks/shared/src/types/native/api/v1/notes/list'
import listClientsApi from '@api/clients/listClientsApi'
import createNoteApi from '@api/notes/createNoteApi'
import deleteNoteApi from '@api/notes/deleteNoteApi'
import listNotesApi from '@api/notes/listNotesApi'
import updateNoteApi from '@api/notes/updateNoteApi'
import { apiPostRequest, useApiGetQuery } from '@features/apiLayer'
import { queryClient } from '@features/queryClient'
import { NOTE_ERRORS } from '@typings/native/notes/errors'
import type { OnboardingTourStep } from '@components/template/OnboardingTour/.ts'

export type { NoteColor }

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

const noteFormatDate = (date: Date) => `${NOTE_DATE_FORMAT.format(date)} ${NOTE_TIME_FORMAT.format(date).replace(' ', '').toLowerCase()}`

const noteGetMemberLabel = (record: Note, client: Client | null) =>
  client?.members.find((member) => member.id === record.memberId)?.name ?? client?.name ?? 'Household'

const noteBuildCard = (record: Note, client: Client | null): NoteCardView => {
  const member = noteGetMemberLabel(record, client)
  return {
    id: record.id,
    member,
    memberInitial: member.charAt(0).toUpperCase(),
    title: record.title,
    body: record.text,
    date: noteFormatDate(new Date(record.createdAt)),
    color: record.color,
  }
}

const noteMatchesQuery = (record: Note, client: Client | null, needle: string) =>
  [record.title, record.text, noteGetMemberLabel(record, client)].some((field) => field.toLowerCase().includes(needle))

export function useNoteLibrary() {
  const { clientId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const memberSlug = searchParams.get('member')
  const query = (searchParams.get(NOTE_SEARCH_PARAM) ?? '').trim()
  const clientsQuery = useApiGetQuery(listClientsApi)
  const client = clientsQuery.data?.clients.find((item) => item.slug === clientId) ?? null
  const member = client?.members.find((item) => item.slug === memberSlug) ?? null
  const listParams = { clientId: client?.id ?? '' }
  const notesQuery = useApiGetQuery(listNotesApi, listParams, { enabled: !!client })
  const view: NoteView = searchParams.get(NOTE_VIEW_PARAM) === 'list' ? 'list' : 'grid'

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorStartsEditing, setEditorStartsEditing] = useState(false)
  const [editorSession, setEditorSession] = useState(0)
  const [seenViews, setSeenViews] = useState<NoteView[]>([view])
  const [staggerView, setStaggerView] = useState<NoteView | null>(view)
  const [error, setError] = useState<string | null>(null)
  const [viewedClientId, setViewedClientId] = useState(clientId)
  if (clientId !== viewedClientId) {
    setViewedClientId(clientId)
    setSeenViews([view])
    setStaggerView(view)
    setEditorOpen(false)
    setError(null)
  }

  const [draft, setDraft] = useState(query)
  const [appliedQuery, setAppliedQuery] = useState(query)
  if (query !== appliedQuery) {
    setAppliedQuery(query)
    setDraft(query)
  }

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [clientId, memberSlug])

  const updateParam = (key: string, value: string | null) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  const applySearch = (value: string) => updateParam(NOTE_SEARCH_PARAM, value || null)

  const records = notesQuery.data?.notes ?? []
  const scoped = member ? records.filter((record) => record.memberId === member.id) : records
  const visible = query ? scoped.filter((record) => noteMatchesQuery(record, client, query.toLowerCase())) : scoped

  const editing = editingId ? scoped.find((record) => record.id === editingId) ?? null : null

  const openEditor = (id: string | null, startsEditing: boolean) => {
    setEditingId(id)
    setEditorStartsEditing(startsEditing)
    setEditorSession((session) => session + 1)
    setEditorOpen(true)
  }

  const setCachedNotes = (change: (notes: Note[]) => Note[]) =>
    queryClient.setQueryData<NoteListResponse>([listNotesApi.identifier, listParams], (current) =>
      current && { ...current, notes: change(current.notes) })

  const saveNote = async (saved: NoteSaved) => {
    if (!client) return
    setError(null)
    const fields = {
      title: saved.title.trim() || NOTE_UNTITLED,
      html: saved.html,
      text: saved.text.trim(),
      color: saved.color,
      memberId: client.members.find((item) => item.slug === saved.memberId)?.id ?? null,
    }
    const res = editing
      ? await apiPostRequest(updateNoteApi, { noteId: editing.id, ...fields })
      : await apiPostRequest(createNoteApi, { clientId: client.id, ...fields })
    if (!res.success) return setError(res.error.message)
    const note = res.data.note
    setCachedNotes((notes) => editing ? notes.map((item) => item.id === note.id ? note : item) : [note, ...notes])
    if (!editing && query) applySearch('')
  }

  const deleteNote = async (id: string) => {
    setError(null)
    const res = await apiPostRequest(deleteNoteApi, { noteId: id })
    if (!res.success) return setError(res.error.message)
    setCachedNotes((notes) => notes.filter((item) => item.id !== id))
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
    search: {
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
    } satisfies NoteSearch,
    createNote: () => openEditor(null, true),
    editNote: (id: string) => openEditor(id, true),
    viewNote: (id: string) => openEditor(id, false),
    editor: {
      open: editorOpen,
      key: editorSession,
      startsEditing: editorStartsEditing,
      draft: {
        title: editing?.title ?? '',
        html: editing?.html ?? '',
        color: editing?.color ?? NOTE_COLORS[scoped.length % NOTE_COLORS.length],
        memberId: editing ? client?.members.find((item) => item.id === editing.memberId)?.slug ?? null : memberSlug,
      } satisfies NoteDraft,
      members: [
        { id: null, label: client?.name ?? 'Household' },
        ...(client?.members.map((item) => ({ id: item.slug, label: item.name })) ?? []),
      ] satisfies NoteMemberOption[],
      save: (saved: NoteSaved) => void saveNote(saved),
      close: () => setEditorOpen(false),
    },
    deleteNote: (id: string) => void deleteNote(id),
    loading: clientsQuery.isPending || (!!client && notesQuery.isPending),
    error: error ?? (notesQuery.isError ? NOTE_ERRORS.LOAD_FAILED.MESSAGE : null),
    empty: query
      ? { title: `No notes match “${query}”`, subtitle: 'Try a different search' }
      : { title: 'No notes yet', subtitle: 'Create one to get started' },
  }
}

export const NOTE_LIBRARY_TOUR_STORAGE_KEY = 'onboarding:notes-seen'

export const NOTE_LIBRARY_TOUR_STEPS: OnboardingTourStep[] = [
  {
    target: 'note-search',
    title: 'Search your notes',
    body: 'Find any meeting note or reminder for this client in seconds.',
    placement: 'bottom',
  },
  {
    target: 'note-create',
    title: 'Write a note',
    body: 'Capture meeting notes and tag the household members they relate to.',
    placement: 'bottom',
  },
  {
    target: 'note-view',
    title: 'Switch layouts',
    body: 'Flip between cards and a compact list.',
    placement: 'bottom',
  },
  {
    target: 'note-list',
    title: 'All notes',
    body: 'Open a note to read it, or use its menu to edit or delete it.',
    placement: 'top',
  },
]
