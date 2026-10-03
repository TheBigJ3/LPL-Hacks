import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import type { ExtractedAnalysis } from '@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis'
import type { ExtractedBox } from '@lpl-hacks/shared/src/types/native/extraction/extractedBox'
import type { ExtractedTable } from '@lpl-hacks/shared/src/types/native/extraction/extractedTable'
import type { ExtractedConfidenceLevel, ExtractedValue } from '@lpl-hacks/shared/src/types/native/extraction/extractedValue'
import documentsExtractionSettled from '@lpl-hacks/shared/src/types/native/sockets/documents/extractionSettled'
import documentsWatch from '@lpl-hacks/shared/src/types/native/sockets/documents/watch'
import getDocumentApi from '@api/documents/getDocumentApi'
import uploadDocumentApi from '@api/documents/uploadDocumentApi'
import { apiGetRequest, apiUploadRequest } from '@features/apiLayer'
import { documentPreviewRelease, documentPreviewRender, type DocumentPreviewPage } from '@features/documentPreview'
import { fileDownloadJson } from '@features/fileDownload'
import { socketAwait, socketLayer, socketWatch } from '@stores/socketStore'
import { EXTRACTION_ERRORS } from '@typings/native/extraction/errors'

export const EXTRACTION_UPLOAD_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']
export const EXTRACTION_UPLOAD_MAX_BYTES = 50 * 1024 * 1024
export const EXTRACTION_UPLOAD_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const EXTRACTION_UPLOAD_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg']
export const EXTRACTION_EMPTY_VALUE_LABEL = '—'
export const EXTRACTION_EDITOR_DOM_ID = 'extraction-review-editor'
export const EXTRACTION_PANEL_DOM_ID = 'extraction-review-panel'

const EXTRACTION_CROP_PADDING = { x: 0.05, y: 0.025 }
const EXTRACTION_HIGHLIGHT_PADDING = 0.003
const EXTRACTION_WAIT_MAX_MS = 20 * 60 * 1000
const EXTRACTION_CHECK_CONNECTED_MS = 10_000
const EXTRACTION_CHECK_DISCONNECTED_MS = 3_000

export type ExtractionPhase = 'idle' | 'uploading' | 'extracting'

const EXTRACTION_PHASE_LABELS: Record<ExtractionPhase, string> = {
  idle: 'Choose a PDF or image',
  uploading: 'Uploading…',
  extracting: 'Extracting…',
}

export type ExtractionEditValue = string | boolean

export type ExtractionItemStatus = 'review' | 'edited' | 'confirmed' | 'plain'

type ExtractionItem = {
  id: string
  origin: 'field' | 'cell'
  label: string
  page: number
  box: ExtractedBox | null
  labelBox: ExtractedBox | null
  source: ExtractedValue
  kind: 'text' | 'checkbox'
  text: string
  checked: boolean
  edited: boolean
  status: ExtractionItemStatus
}

const EXTRACTION_STATUS_LABELS: Record<ExtractionItemStatus, string> = {
  review: 'Needs review',
  edited: 'Edited',
  confirmed: 'Approved',
  plain: 'Looks fine',
}

export type ExtractionHighlightView = {
  id: string
  domId: string
  status: ExtractionItemStatus
  selected: boolean
  label: string
  style: CSSProperties
}

export type ExtractionPageView = {
  number: number
  imageUrl: string
  style: CSSProperties
  highlights: ExtractionHighlightView[]
}

export type ExtractionDocumentView = {
  pages: ExtractionPageView[]
  previewMessage: string | null
}

export type ExtractionReviewListItem = {
  id: string
  label: string
  summary: string
  icon: string
  open: boolean
  selected: boolean
}

export type ExtractionCropView = {
  imageUrl: string
  frameStyle: CSSProperties
  imageStyle: CSSProperties
  markerStyle: CSSProperties
}

export type ExtractionSelectedView = {
  id: string
  label: string
  kind: 'text' | 'checkbox'
  text: string
  checked: boolean
  readAs: string
  normalizedLabel: string | null
  confidencePercent: string
  confidenceLevel: ExtractedConfidenceLevel
  issues: string[]
  status: ExtractionItemStatus
  statusLabel: string
  canConfirm: boolean
  canRevert: boolean
  crop: ExtractionCropView | null
}

export type ExtractionReviewView = {
  total: number
  resolved: number
  unresolved: number
  progressStyle: CSSProperties
  nextLabel: string
  exportHint: string | null
  flagged: ExtractionReviewListItem[]
  pickedUp: ExtractionReviewListItem[]
  missing: ExtractionReviewListItem[]
  selected: ExtractionSelectedView | null
}

type ExtractionAnalysis = {
  documentId: string
  fileName: string
  pageCount: number
  data: ExtractedAnalysis
}

type ExtractionWaitResult =
  | { success: true, documentId: string, pageCount: number, data: ExtractedAnalysis }
  | { success: false, message: string }

function extractionFormatPercent(confidence: number | null): string {
  return confidence === null ? EXTRACTION_EMPTY_VALUE_LABEL : `${confidence.toFixed(1)}%`
}

function extractionFormatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(3)}%`
}

function extractionFormatNormalized(value: ExtractedValue): string | null {
  if (value.value === null || typeof value.value === 'boolean') return null
  return String(value.value) === value.rawValue ? null : `→ ${value.value}`
}

function extractionFormatItemValue(item: ExtractionItem): string {
  if (item.kind === 'checkbox') return item.checked ? 'Checked' : 'Unchecked'
  return item.text === '' ? 'Empty' : item.text
}

function extractionHighlightDomId(id: string): string {
  return `extraction-highlight-${id}`
}

function extractionBuildItem(
  base: Pick<ExtractionItem, 'id' | 'origin' | 'label' | 'page' | 'box' | 'labelBox' | 'source'>,
  edits: Record<string, ExtractionEditValue>,
  confirmed: Record<string, boolean>,
): ExtractionItem {
  const { id, source } = base
  const kind = source.dataType === 'checkbox' ? 'checkbox' : 'text'
  const edit = edits[id]
  const originalText = source.rawValue ?? ''
  const text = typeof edit === 'string' ? edit : originalText
  const checked = typeof edit === 'boolean' ? edit : source.value === true
  const edited = kind === 'checkbox'
    ? typeof edit === 'boolean' && (source.value === null || edit !== source.value)
    : text !== originalText
  const status: ExtractionItemStatus = edited ? 'edited'
    : confirmed[id] && source.requiresReview ? 'confirmed'
      : source.requiresReview ? 'review' : 'plain'
  return { ...base, kind, text, checked, edited, status }
}

function extractionBuildItems(data: ExtractedAnalysis, edits: Record<string, ExtractionEditValue>, confirmed: Record<string, boolean>): ExtractionItem[] {
  const fieldItems = data.fields.map((field) => extractionBuildItem(
    { id: field.id, origin: 'field', label: field.label, page: field.page, box: field.valueBox, labelBox: field.labelBox, source: field },
    edits,
    confirmed,
  ))
  const cellItems = data.tables.flatMap((table, tableIndex) => table.cells
    .filter((cell) => cell.role === 'value' && !cell.fieldId && !(table.kind === 'form' && !cell.rawValue))
    .map((cell) => {
      const header = table.cells.find((other) => other.role === 'header' && other.column === cell.column && other.rawValue)
      const label = header ? `${header.rawValue} · row ${cell.row}` : `Table ${tableIndex + 1} · row ${cell.row}, column ${cell.column}`
      return extractionBuildItem({ id: cell.id, origin: 'cell', label, page: table.page, box: cell.box, labelBox: null, source: cell }, edits, confirmed)
    }))
  return [...fieldItems, ...cellItems]
}

function extractionBuildHighlight(item: ExtractionItem, box: ExtractedBox, aspect: number, selectedId: string | null): ExtractionHighlightView {
  const padX = EXTRACTION_HIGHLIGHT_PADDING
  const padY = EXTRACTION_HIGHLIGHT_PADDING / aspect
  return {
    id: item.id,
    domId: extractionHighlightDomId(item.id),
    status: item.status,
    selected: item.id === selectedId,
    label: `${item.label}: ${extractionFormatItemValue(item)}`,
    style: {
      left: extractionFormatRatio(box.left - padX),
      top: extractionFormatRatio(box.top - padY),
      width: extractionFormatRatio(box.width + padX * 2),
      height: extractionFormatRatio(box.height + padY * 2),
    },
  }
}

function extractionBuildPages(items: ExtractionItem[], previews: DocumentPreviewPage[] | null, selectedId: string | null): ExtractionPageView[] {
  return (previews ?? []).map((preview, index): ExtractionPageView => {
    const number = index + 1
    return {
      number,
      imageUrl: preview.url,
      style: { aspectRatio: `1 / ${preview.aspect}` },
      highlights: items.flatMap((item) => item.page === number && item.box ? [extractionBuildHighlight(item, item.box, preview.aspect, selectedId)] : []),
    }
  })
}

function extractionBuildCrop(box: ExtractedBox, preview: DocumentPreviewPage): ExtractionCropView {
  const left = Math.max(0, box.left - EXTRACTION_CROP_PADDING.x)
  const top = Math.max(0, box.top - EXTRACTION_CROP_PADDING.y)
  const width = Math.min(1, box.left + box.width + EXTRACTION_CROP_PADDING.x) - left
  const height = Math.min(1, box.top + box.height + EXTRACTION_CROP_PADDING.y) - top
  return {
    imageUrl: preview.url,
    frameStyle: { aspectRatio: `${width} / ${height * preview.aspect}` },
    imageStyle: { width: extractionFormatRatio(1 / width), left: extractionFormatRatio(-left / width), top: extractionFormatRatio(-top / height) },
    markerStyle: {
      left: extractionFormatRatio((box.left - left) / width),
      top: extractionFormatRatio((box.top - top) / height),
      width: extractionFormatRatio(box.width / width),
      height: extractionFormatRatio(box.height / height),
    },
  }
}

function extractionBuildSelected(item: ExtractionItem, previews: DocumentPreviewPage[] | null): ExtractionSelectedView {
  const preview = previews?.[item.page - 1]
  return {
    id: item.id,
    label: item.label,
    kind: item.kind,
    text: item.text,
    checked: item.checked,
    readAs: item.source.rawValue === null ? 'Nothing detected' : item.source.rawValue === '' ? 'Empty' : item.source.rawValue,
    normalizedLabel: extractionFormatNormalized(item.source),
    confidencePercent: extractionFormatPercent(item.source.confidence),
    confidenceLevel: item.source.confidenceLevel,
    issues: item.source.issues,
    status: item.status,
    statusLabel: EXTRACTION_STATUS_LABELS[item.status],
    canConfirm: item.status === 'review',
    canRevert: item.edited,
    crop: item.box && preview ? extractionBuildCrop(item.box, preview) : null,
  }
}

function extractionBuildReviewListItem(item: ExtractionItem, selectedId: string | null, summary: string): ExtractionReviewListItem {
  const open = item.status === 'review'
  return {
    id: item.id,
    label: item.label,
    summary,
    icon: open ? 'error' : 'check_circle',
    open,
    selected: item.id === selectedId,
  }
}

function extractionBuildReview(items: ExtractionItem[], previews: DocumentPreviewPage[] | null, selectedId: string | null): ExtractionReviewView {
  const flagged = items.filter((item) => item.source.requiresReview)
  const resolved = flagged.filter((item) => item.status !== 'review').length
  const selected = items.find((item) => item.id === selectedId)
  return {
    total: flagged.length,
    resolved,
    unresolved: flagged.length - resolved,
    progressStyle: { width: extractionFormatRatio(flagged.length === 0 ? 1 : resolved / flagged.length) },
    nextLabel: flagged.length === resolved ? 'All reviewed' : 'Next to review',
    exportHint: flagged.length === resolved ? null : `${flagged.length - resolved} flagged ${flagged.length - resolved === 1 ? 'field' : 'fields'} not reviewed yet`,
    flagged: flagged.map((item) => extractionBuildReviewListItem(
      item,
      selectedId,
      item.status === 'review' ? item.source.issues[0] ?? '' : EXTRACTION_STATUS_LABELS[item.status],
    )),
    pickedUp: items
      .filter((item) => item.box !== null && !item.source.requiresReview)
      .map((item) => extractionBuildReviewListItem(item, selectedId, item.edited ? `Edited: ${extractionFormatItemValue(item)}` : extractionFormatItemValue(item))),
    missing: items
      .filter((item) => item.box === null && !item.source.requiresReview)
      .map((item) => extractionBuildReviewListItem(item, selectedId, item.edited ? `Filled in: ${item.text}` : 'Not found on the page')),
    selected: selected ? extractionBuildSelected(selected, previews) : null,
  }
}

function extractionExportValue(item: ExtractionItem): string | boolean {
  return item.kind === 'checkbox' ? item.checked : item.text
}

function extractionExportFields(items: ExtractionItem[]): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {}
  for (const item of items) {
    if (item.origin !== 'field') continue
    let key = item.label
    for (let copy = 2; key in fields; copy++) key = `${item.label} (${copy})`
    fields[key] = extractionExportValue(item)
  }
  return fields
}

function extractionExportTable(
  table: ExtractedTable,
  itemsById: Map<string, ExtractionItem>,
  edits: Record<string, ExtractionEditValue>,
  confirmed: Record<string, boolean>,
) {
  const values = new Map(table.cells.map((cell) => [
    `${cell.row}:${cell.column}`,
    extractionExportValue(itemsById.get(cell.fieldId ?? cell.id) ?? extractionBuildItem(
      { id: cell.id, origin: 'cell', label: '', page: table.page, box: cell.box, labelBox: null, source: cell },
      edits,
      confirmed,
    )),
  ]))
  const columns = Array.from({ length: table.columnCount }, (_, index) => index + 1)
  const headerRows = new Set(table.cells.filter((cell) => cell.role === 'header').map((cell) => cell.row))
  const headers = columns.map((column) => table.cells.find((cell) => cell.role === 'header' && cell.column === column)?.rawValue ?? null)
  const rows = Array.from({ length: table.rowCount }, (_, index) => index + 1)
    .filter((row) => !headerRows.has(row))
    .map((row) => columns.map((column) => values.get(`${row}:${column}`) ?? ''))
  if (headers.every((header) => header)) return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
  return headers.some((header) => header) ? [headers.map((header) => header ?? ''), ...rows] : rows
}

function extractionBuildExport(
  analysis: ExtractionAnalysis,
  items: ExtractionItem[],
  edits: Record<string, ExtractionEditValue>,
  confirmed: Record<string, boolean>,
) {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  return {
    fileName: analysis.fileName,
    fields: extractionExportFields(items),
    tables: analysis.data.tables.map((table) => extractionExportTable(table, itemsById, edits, confirmed)),
  }
}

function extractionRevealEditor() {
  document.getElementById(EXTRACTION_EDITOR_DOM_ID)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function extractionRevealItem(id: string) {
  const highlight = document.getElementById(extractionHighlightDomId(id))
  if (!highlight) {
    extractionRevealEditor()
    return
  }
  document.getElementById(EXTRACTION_PANEL_DOM_ID)?.scrollTo({ top: 0, behavior: 'smooth' })
  highlight.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function extractionWaitForDocument(documentId: string, signal: AbortSignal): Promise<ExtractionWaitResult | null> {
  const unwatch = socketWatch(documentsWatch, { documentId })
  const deadline = Date.now() + EXTRACTION_WAIT_MAX_MS

  try {
    while (Date.now() < deadline) {
      const timeoutMs = socketLayer.getSnapshot() === 'connected' ? EXTRACTION_CHECK_CONNECTED_MS : EXTRACTION_CHECK_DISCONNECTED_MS
      const settled = socketAwait(documentsExtractionSettled, (payload) => payload.documentId === documentId, { timeoutMs, signal })
      const res = await apiGetRequest(getDocumentApi, { documentId })
      if (signal.aborted) return null
      if (!res.success) return { success: false, message: res.error.message }

      const { document, extraction } = res.data
      if (document.status === 'extracted' && extraction) return { success: true, documentId, pageCount: document.pageCount ?? 1, data: extraction }
      if (document.status === 'failed') return { success: false, message: document.failureMessage ?? EXTRACTION_ERRORS.WAIT_TIMED_OUT.MESSAGE }

      await settled
      if (signal.aborted) return null
    }
    return { success: false, message: EXTRACTION_ERRORS.WAIT_TIMED_OUT.MESSAGE }
  } finally {
    unwatch()
  }
}

async function extractionUploadAndWait(file: File, signal: AbortSignal, onUploaded: () => void): Promise<ExtractionWaitResult | null> {
  const res = await apiUploadRequest(uploadDocumentApi, { fileName: file.name }, file)
  if (signal.aborted) return null
  if (!res.success) return { success: false, message: res.error.message }

  onUploaded()
  return extractionWaitForDocument(res.data.document.id, signal)
}

export function useExtractionUpload() {
  const [phase, setPhase] = useState<ExtractionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ExtractionAnalysis | null>(null)
  const [previews, setPreviews] = useState<DocumentPreviewPage[] | null>(null)
  const [edits, setEdits] = useState<Record<string, ExtractionEditValue>>({})
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const uploadAbort = useRef<AbortController | null>(null)

  useEffect(() => () => {
    if (previews) documentPreviewRelease(previews)
  }, [previews])

  useEffect(() => () => uploadAbort.current?.abort(), [])

  const result = useMemo(() => {
    if (!analysis) return null
    const { data } = analysis
    const items = extractionBuildItems(data, edits, confirmed)
    const review = extractionBuildReview(items, previews, selectedId)
    return {
      items,
      review,
      summary: `${analysis.fileName} · ${analysis.pageCount} ${analysis.pageCount === 1 ? 'page' : 'pages'} · ${review.unresolved} of ${review.total} left to review`,
      document: {
        pages: extractionBuildPages(items, previews, selectedId),
        previewMessage: previews ? null : EXTRACTION_ERRORS.PREVIEW_UNAVAILABLE.MESSAGE,
      } satisfies ExtractionDocumentView,
    }
  }, [analysis, previews, edits, confirmed, selectedId])

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!EXTRACTION_UPLOAD_MIME_TYPES.includes(file.type)) {
      setError(EXTRACTION_ERRORS.FILE_TYPE_INVALID.MESSAGE)
      return
    }
    if (file.size > EXTRACTION_UPLOAD_MAX_BYTES) {
      setError(EXTRACTION_ERRORS.FILE_TOO_LARGE.MESSAGE)
      return
    }
    if (EXTRACTION_UPLOAD_IMAGE_MIME_TYPES.includes(file.type) && file.size > EXTRACTION_UPLOAD_IMAGE_MAX_BYTES) {
      setError(EXTRACTION_ERRORS.IMAGE_TOO_LARGE.MESSAGE)
      return
    }

    uploadAbort.current?.abort()
    const abort = new AbortController()
    uploadAbort.current = abort

    setError(null)
    setAnalysis(null)
    setPreviews(null)
    setPhase('uploading')
    const [result, pages] = await Promise.all([
      extractionUploadAndWait(file, abort.signal, () => setPhase('extracting')),
      documentPreviewRender(file),
    ])

    if (!result || !result.success) {
      if (pages) documentPreviewRelease(pages)
      if (!result) return
      setPhase('idle')
      setError(result.message)
      return
    }
    setPhase('idle')
    setEdits({})
    setConfirmed({})
    setSelectedId(null)
    setPreviews(pages)
    setAnalysis({ documentId: result.documentId, fileName: file.name, pageCount: result.pageCount, data: result.data })
  }

  function edit(id: string, value: ExtractionEditValue) {
    setEdits((current) => ({ ...current, [id]: value }))
  }

  function confirm(id: string) {
    setConfirmed((current) => ({ ...current, [id]: true }))
  }

  function revert(id: string) {
    setEdits((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)))
  }

  function select(id: string) {
    setSelectedId(id)
    requestAnimationFrame(extractionRevealEditor)
  }

  function focusItem(id: string) {
    if (!result?.items.some((item) => item.id === id)) return
    setSelectedId(id)
    requestAnimationFrame(() => extractionRevealItem(id))
  }

  function confirmExport() {
    if (!analysis || !result) return
    fileDownloadJson(`${analysis.fileName.replace(/\.[^.]+$/, '')}.json`, extractionBuildExport(analysis, result.items, edits, confirmed))
  }

  function focusNext() {
    const open = result?.items.filter((item) => item.status === 'review') ?? []
    if (open.length === 0) return
    const order = result!.items.filter((item) => item.source.requiresReview)
    const start = order.findIndex((item) => item.id === selectedId)
    const next = [...order.slice(start + 1), ...order.slice(0, start + 1)].find((item) => item.status === 'review')
    if (next) focusItem(next.id)
  }

  return {
    busy: phase !== 'idle',
    statusLabel: EXTRACTION_PHASE_LABELS[phase],
    error,
    result,
    upload,
    edit,
    confirm,
    revert,
    select,
    focusItem,
    focusNext,
    confirmExport,
    accept: EXTRACTION_UPLOAD_MIME_TYPES.join(','),
  }
}
