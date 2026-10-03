import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useParams } from 'react-router'
import type { UploadRequestState } from '@lpl-hacks/shared/src/types/native/uploadRequests/uploadRequest'
import getUploadRequestPortalApi from '@api/uploadRequests/getUploadRequestPortalApi'
import submitUploadRequestApi from '@api/uploadRequests/submitUploadRequestApi'
import uploadUploadRequestFileApi from '@api/uploadRequests/uploadUploadRequestFileApi'
import { apiPostRequest, apiUploadRequest, useApiGetQuery } from '@features/apiLayer'
import { DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_HINT, documentUploadCheckFile } from '@features/documentUploadCheck'
import { useDocumentTitle } from '@hooks/useDocumentTitle'
import { UPLOAD_REQUEST_ERRORS } from '@typings/native/uploadRequests/errors'

export type UploadRequestPortalFileStatus = 'ready' | 'invalid' | 'uploading' | 'uploaded' | 'failed'

export type UploadRequestPortalFileView = {
  id: number
  name: string
  detail: string
  status: UploadRequestPortalFileStatus
  icon: string
  canRemove: boolean
}

export type UploadRequestPortalNoticeView = {
  tone: 'success' | 'muted' | 'error'
  icon: string
  title: string
  message: string
}

type UploadRequestPortalFile = {
  id: number
  file: File
  status: UploadRequestPortalFileStatus
  message: string | null
}

const UPLOAD_REQUEST_PORTAL_TITLE = 'Send your documents'
const UPLOAD_REQUEST_PORTAL_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' })

export const UPLOAD_REQUEST_PORTAL_STEPS = [
  { number: 1, label: 'Add your files' },
  { number: 2, label: 'Check the list' },
  { number: 3, label: 'Send them' },
]

const UPLOAD_REQUEST_PORTAL_FILE_ICONS: Record<UploadRequestPortalFileStatus, string> = {
  ready: 'description',
  invalid: 'error',
  uploading: 'progress_activity',
  uploaded: 'check_circle',
  failed: 'error',
}

const UPLOAD_REQUEST_PORTAL_CLOSED: Record<Exclude<UploadRequestState, 'open'>, UploadRequestPortalNoticeView> = {
  submitted: { tone: 'muted', icon: 'inbox', title: 'Already sent', message: UPLOAD_REQUEST_ERRORS.LINK_SUBMITTED.MESSAGE },
  expired: { tone: 'muted', icon: 'timer_off', title: 'Link expired', message: UPLOAD_REQUEST_ERRORS.LINK_EXPIRED.MESSAGE },
  revoked: { tone: 'muted', icon: 'link_off', title: 'Link turned off', message: UPLOAD_REQUEST_ERRORS.LINK_REVOKED.MESSAGE },
}

const uploadRequestPortalFormatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const uploadRequestPortalFileDetail = (entry: UploadRequestPortalFile) => {
  if (entry.message) return entry.message
  if (entry.status === 'uploading') return 'Uploading…'
  if (entry.status === 'uploaded') return 'Uploaded'
  return uploadRequestPortalFormatSize(entry.file.size)
}

export function useUploadRequestPortal() {
  const { token = '' } = useParams()
  const portalQuery = useApiGetQuery(getUploadRequestPortalApi, { token }, { retry: false, refetchOnWindowFocus: false })
  const [files, setFiles] = useState<UploadRequestPortalFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const nextId = useRef(1)

  const portal = portalQuery.data?.portal ?? null
  const sendable = files.filter((entry) => entry.status === 'ready' || entry.status === 'failed' || entry.status === 'uploaded')

  useDocumentTitle(UPLOAD_REQUEST_PORTAL_TITLE)

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || !portal || sending) return
    const room = portal.maxFiles - files.filter((entry) => entry.status !== 'invalid').length
    const accepted = Array.from(incoming).map((file): UploadRequestPortalFile => {
      const invalid = documentUploadCheckFile(file)
      return { id: nextId.current++, file, status: invalid ? 'invalid' : 'ready', message: invalid?.MESSAGE ?? null }
    })
    const valid = accepted.filter((entry) => entry.status === 'ready')
    const overflow = valid.slice(Math.max(room, 0))
    setError(overflow.length > 0 ? UPLOAD_REQUEST_ERRORS.TOO_MANY_FILES.MESSAGE : null)
    setFiles((current) => [...current, ...accepted.filter((entry) => !overflow.includes(entry))])
  }

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files)
    event.target.value = ''
  }

  const dragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (!sending) setDragging(true)
  }

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const remove = (id: number) => {
    if (sending) return
    setFiles((current) => current.filter((entry) => entry.id !== id))
  }

  const markFile = (id: number, status: UploadRequestPortalFileStatus, message: string | null = null) =>
    setFiles((current) => current.map((entry) => entry.id === id ? { ...entry, status, message } : entry))

  const send = async () => {
    if (sending || sendable.length === 0) return
    setSending(true)
    setError(null)

    let failed = false
    for (const entry of sendable) {
      if (entry.status === 'uploaded') continue
      markFile(entry.id, 'uploading')
      const res = await apiUploadRequest(uploadUploadRequestFileApi, { token, fileName: entry.file.name }, entry.file)
      if (res.success) {
        markFile(entry.id, 'uploaded')
        continue
      }
      failed = true
      markFile(entry.id, 'failed', res.error.message)
    }

    if (failed) {
      setSending(false)
      setError(UPLOAD_REQUEST_ERRORS.SOME_FILES_FAILED.MESSAGE)
      return
    }

    const res = await apiPostRequest(submitUploadRequestApi, { token })
    setSending(false)
    if (!res.success) {
      setError(res.error.message)
      return
    }
    setSentCount(res.data.documentCount)
  }

  const notice: UploadRequestPortalNoticeView | null =
    sentCount !== null
      ? { tone: 'success', icon: 'check_circle', title: 'Documents sent', message: `${portal?.requestedBy ?? 'Your advisor'} received your ${sentCount} ${sentCount === 1 ? 'file' : 'files'}. You can close this page.` }
      : portalQuery.isError
        ? { tone: 'error', icon: 'link_off', title: "This link doesn't work", message: portalQuery.error.message }
        : portal && portal.state !== 'open'
          ? UPLOAD_REQUEST_PORTAL_CLOSED[portal.state]
          : null

  return {
    loading: portalQuery.isPending,
    portal,
    notice,
    footer: portal ? `Private link · Works once · Expires ${UPLOAD_REQUEST_PORTAL_DATE_FORMAT.format(new Date(portal.expiresAt))}` : '',
    files: files.map((entry): UploadRequestPortalFileView => ({
      id: entry.id,
      name: entry.file.name,
      detail: uploadRequestPortalFileDetail(entry),
      status: entry.status,
      icon: UPLOAD_REQUEST_PORTAL_FILE_ICONS[entry.status],
      canRemove: !sending && entry.status !== 'uploaded' && entry.status !== 'uploading',
    })),
    accept: DOCUMENT_UPLOAD_ACCEPT,
    hint: portal ? `${DOCUMENT_UPLOAD_HINT}. Up to ${portal.maxFiles} files.` : DOCUMENT_UPLOAD_HINT,
    dragging,
    sending,
    error,
    sendLabel: sending ? 'Sending…' : sendable.length === 0 ? 'Add files to send' : `Send ${sendable.length} ${sendable.length === 1 ? 'file' : 'files'}`,
    canSend: !sending && sendable.length > 0,
    pick,
    dragOver,
    dragLeave: () => setDragging(false),
    drop,
    remove,
    send,
  }
}
