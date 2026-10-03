import { useEffect, useState, type FormEvent } from 'react'
import type { Client } from '@lpl-hacks/shared/src/types/native/clients/client'
import type { DocumentStatus } from '@lpl-hacks/shared/src/types/native/documents/document'
import { uploadRequestExpiryDays, type UploadRequest, type UploadRequestExpiryDays, type UploadRequestState } from '@lpl-hacks/shared/src/types/native/uploadRequests/uploadRequest'
import createUploadRequestApi from '@api/uploadRequests/createUploadRequestApi'
import listUploadRequestsApi from '@api/uploadRequests/listUploadRequestsApi'
import revokeUploadRequestApi from '@api/uploadRequests/revokeUploadRequestApi'
import { apiPostRequest, useApiGetQuery } from '@features/apiLayer'
import { queryClient } from '@features/queryClient'
import { UPLOAD_REQUEST_ERRORS } from '@typings/native/uploadRequests/errors'

export type ExtractionRequestDocumentView = {
  id: string
  fileName: string
  statusLabel: string
  status: DocumentStatus
  canReview: boolean
}

export type ExtractionRequestView = {
  id: string
  link: string
  state: UploadRequestState
  stateLabel: string
  stateIcon: string
  meta: string
  note: string | null
  canCopy: boolean
  canRevoke: boolean
  copied: boolean
  fresh: boolean
  documents: ExtractionRequestDocumentView[]
}

const EXTRACTION_REQUEST_DEFAULT_EXPIRY: UploadRequestExpiryDays = 7
const EXTRACTION_REQUEST_NOTE_MAX = 500
const EXTRACTION_REQUEST_COPIED_MS = 2000
const EXTRACTION_REQUEST_REFRESH_MS = 15_000
const EXTRACTION_REQUEST_LINK_PATH = '/request/'

const EXTRACTION_REQUEST_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

const EXTRACTION_REQUEST_STATE_LABELS: Record<UploadRequestState, { label: string, icon: string }> = {
  open: { label: 'Waiting for files', icon: 'schedule' },
  submitted: { label: 'Files received', icon: 'inbox' },
  expired: { label: 'Expired', icon: 'timer_off' },
  revoked: { label: 'Turned off', icon: 'link_off' },
}

const EXTRACTION_REQUEST_DOCUMENT_LABELS: Record<DocumentStatus, string> = {
  uploaded: 'Queued',
  extracting: 'Extracting…',
  extracted: 'Ready to review',
  failed: "Couldn't read",
}

const extractionRequestFormatDays = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`

const extractionRequestBuildMeta = (request: UploadRequest) => {
  const created = `Created ${EXTRACTION_REQUEST_DATE_FORMAT.format(new Date(request.createdAt))}`
  if (request.state === 'submitted' && request.submittedAt) {
    const count = request.documents.length
    return `${created} · ${count} ${count === 1 ? 'file' : 'files'} sent ${EXTRACTION_REQUEST_DATE_FORMAT.format(new Date(request.submittedAt))}`
  }
  if (request.state === 'open') return `${created} · Expires ${EXTRACTION_REQUEST_DATE_FORMAT.format(new Date(request.expiresAt))} · Works once`
  return created
}

const extractionRequestNeedsRefresh = (requests: UploadRequest[] | undefined) =>
  !!requests?.some((request) => request.state === 'open' || request.documents.some((document) => document.status === 'uploaded' || document.status === 'extracting'))

export function useExtractionRequest(client: Client | null) {
  const [note, setNote] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<UploadRequestExpiryDays>(EXTRACTION_REQUEST_DEFAULT_EXPIRY)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const requestsQuery = useApiGetQuery(listUploadRequestsApi, { clientId: client?.id ?? '' }, {
    enabled: !!client,
    refetchInterval: (query) => extractionRequestNeedsRefresh(query.state.data?.uploadRequests) ? EXTRACTION_REQUEST_REFRESH_MS : false,
  })

  useEffect(() => {
    if (!copiedId) return
    const timeout = setTimeout(() => setCopiedId(null), EXTRACTION_REQUEST_COPIED_MS)
    return () => clearTimeout(timeout)
  }, [copiedId])

  const refreshList = () => queryClient.invalidateQueries({ queryKey: [listUploadRequestsApi.identifier] })

  const create = async (event: FormEvent) => {
    event.preventDefault()
    if (!client || creating) return
    setCreating(true)
    setError(null)
    const res = await apiPostRequest(createUploadRequestApi, { clientId: client.id, note: note.trim() || undefined, expiresInDays })
    setCreating(false)
    if (!res.success) {
      setError(res.error.message)
      return
    }
    setNote('')
    setFreshId(res.data.uploadRequest.id)
    await refreshList()
  }

  const copy = async (request: ExtractionRequestView) => {
    try {
      await navigator.clipboard.writeText(request.link)
      setError(null)
      setCopiedId(request.id)
    } catch {
      setError(UPLOAD_REQUEST_ERRORS.CLIPBOARD_BLOCKED.MESSAGE)
    }
  }

  const revoke = async (uploadRequestId: string) => {
    const res = await apiPostRequest(revokeUploadRequestApi, { uploadRequestId })
    if (!res.success) setError(res.error.message)
    await refreshList()
  }

  const requests: ExtractionRequestView[] = (requestsQuery.data?.uploadRequests ?? []).map((request) => ({
    id: request.id,
    link: `${window.location.origin}${EXTRACTION_REQUEST_LINK_PATH}${request.token}`,
    state: request.state,
    stateLabel: EXTRACTION_REQUEST_STATE_LABELS[request.state].label,
    stateIcon: EXTRACTION_REQUEST_STATE_LABELS[request.state].icon,
    meta: extractionRequestBuildMeta(request),
    note: request.note,
    canCopy: request.state === 'open',
    canRevoke: request.state === 'open',
    copied: request.id === copiedId,
    fresh: request.id === freshId,
    documents: request.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      status: document.status,
      statusLabel: EXTRACTION_REQUEST_DOCUMENT_LABELS[document.status],
      canReview: document.status === 'extracted',
    })),
  }))

  return {
    note,
    noteMax: EXTRACTION_REQUEST_NOTE_MAX,
    setNote,
    expiryOptions: uploadRequestExpiryDays.map((days) => ({ days, label: extractionRequestFormatDays(days), selected: days === expiresInDays })),
    setExpiresInDays,
    creating,
    createLabel: creating ? 'Creating link…' : 'Create upload link',
    error,
    create,
    copy,
    revoke,
    requests,
    loading: requestsQuery.isPending && !!client,
    loadFailed: requestsQuery.isError,
  }
}
