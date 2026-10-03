import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { ExtractedAnalysis } from '@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis'
import type { ExtractedBox } from '@lpl-hacks/shared/src/types/native/extraction/extractedBox'
import type { ExtractedConfidenceLevel, ExtractedValue } from '@lpl-hacks/shared/src/types/native/extraction/extractedValue'
import documentsExtractionSettled from '@lpl-hacks/shared/src/types/native/sockets/documents/extractionSettled'
import documentsWatch from '@lpl-hacks/shared/src/types/native/sockets/documents/watch'
import type { Document } from '@lpl-hacks/shared/src/types/native/documents/document'
import type { DocumentReview, DocumentReviewField } from '@lpl-hacks/shared/src/types/native/documents/documentReview'
import type { DocumentTagging } from '@lpl-hacks/shared/src/types/native/documents/documentTagging'
import documentsTagSettled from '@lpl-hacks/shared/src/types/native/sockets/documents/tagSettled'
import listClientsApi from '@api/clients/listClientsApi'
import confirmDocumentApi from '@api/documents/confirmDocumentApi'
import getDocumentApi from '@api/documents/getDocumentApi'
import getDocumentContentApi from '@api/documents/getDocumentContentApi'
import uploadDocumentApi from '@api/documents/uploadDocumentApi'
import { apiGetRequest, apiPostRequest, apiUploadRequest, useApiGetQuery } from '@features/apiLayer'
import { DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_HINT, documentUploadCheckFile } from '@features/documentUploadCheck'
import { documentPreviewRelease, documentPreviewRender, type DocumentPreviewPage } from '@features/documentPreview'
import { socketAwait, socketLayer, socketWatch } from '@stores/socketStore'
import { EXTRACTION_ERRORS } from '@typings/native/extraction/errors'

export const EXTRACTION_EMPTY_VALUE_LABEL = '—'
export const EXTRACTION_EDITOR_DOM_ID = 'extraction-review-editor'
export const EXTRACTION_PANEL_DOM_ID = 'extraction-review-panel'

const EXTRACTION_CROP_MARGIN = { x: 0.02, y: 0.012 }
const EXTRACTION_CROP_MIN_WIDTH = 0.16
const EXTRACTION_CROP_FRAME_RATIO = { min: 0.3, max: 0.9 }
const EXTRACTION_CROP_LABEL_REACH = { width: 0.45, height: 0.08 }
const EXTRACTION_BOX_MIN = { width: 0.02, height: 0.01 }
const EXTRACTION_HIGHLIGHT_PADDING = 0.003
const EXTRACTION_WAIT_MAX_MS = 20 * 60 * 1000
const EXTRACTION_CHECK_CONNECTED_MS = 10_000
const EXTRACTION_CHECK_DISCONNECTED_MS = 3_000
const EXTRACTION_TAG_WAIT_MAX_MS = 10 * 60 * 1000

const EXTRACTION_DOC_TYPE_LABELS: Record<string, string> = {
  w2: 'W-2',
  '1099_int': '1099-INT',
  '1099_r': '1099-R',
  '1099_div': '1099-DIV',
  '1099_nec': '1099-NEC',
  '1040': 'Form 1040',
  '1098': 'Form 1098',
  '5498_sa': '5498-SA',
  '1095': 'Form 1095',
  account_statement: 'Account statement',
}

export type ExtractionPhase = 'idle' | 'uploading' | 'opening' | 'extracting'

const EXTRACTION_PHASE_LABELS: Record<ExtractionPhase, string> = {
  idle: 'Choose a PDF or image',
  uploading: 'Uploading…',
  opening: 'Opening document…',
  extracting: 'Extracting…',
}

export type ExtractionMode = 'self' | 'request'

const EXTRACTION_MODE_PARAM = 'mode'
const EXTRACTION_DOCUMENT_PARAM = 'document'

export const EXTRACTION_MODE_OPTIONS: { mode: ExtractionMode, icon: string, title: string, hint: string }[] = [
  { mode: 'self', icon: 'upload_file', title: 'Upload files myself', hint: 'Extract and review a document now' },
  { mode: 'request', icon: 'add_link', title: 'Request from client', hint: 'Send a link they can upload one set of files with' },
]

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
  edited: 'Corrected',
  confirmed: 'Approved',
  plain: 'Looks fine',
}

const EXTRACTION_STATUS_ICONS: Record<ExtractionItemStatus, string> = {
  review: 'error',
  edited: 'edit',
  confirmed: 'check_circle',
  plain: 'check',
}

const EXTRACTION_GUIDANCE: Record<ExtractionItemStatus, string> = {
  review: 'Compare what we read with the document. Approve it if it matches, or type the correct value.',
  edited: 'Your correction will be used instead of what we read.',
  confirmed: 'You approved this value as it was read.',
  plain: "This value wasn't flagged. You can still correct it if something looks off.",
}

const EXTRACTION_CONFIDENCE_LABELS: Record<ExtractedConfidenceLevel, string> = {
  high: 'High certainty',
  medium: 'Medium certainty',
  low: 'Low certainty',
  unknown: 'Certainty unknown',
}

export const EXTRACTION_HIGHLIGHT_LEGEND: { status: ExtractionItemStatus, label: string }[] = [
  { status: 'review', label: 'Needs review' },
  { status: 'confirmed', label: 'Approved' },
  { status: 'edited', label: 'Corrected' },
]

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
  context: string
  guidance: string
  kind: 'text' | 'checkbox'
  text: string
  checked: boolean
  readAs: string
  readAsMissing: boolean
  normalizedLabel: string | null
  changedFrom: string | null
  confidenceLabel: string
  confidencePercent: string
  confidenceLevel: ExtractedConfidenceLevel
  issues: string[]
  status: ExtractionItemStatus
  statusLabel: string
  statusIcon: string
  canConfirm: boolean
  canUnconfirm: boolean
  canRevert: boolean
  canGoNext: boolean
  pageLabel: string
  locationNote: string | null
  crop: ExtractionCropView | null
}

export type ExtractionReviewView = {
  total: number
  resolved: number
  unresolved: number
  progressStyle: CSSProperties
  nextLabel: string
  confirmHint: string | null
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
  | { success: true, document: Document, data: ExtractedAnalysis, review: DocumentReview | null, tagging: DocumentTagging | null }
  | { success: false, message: string }

type ExtractionTagState = {
  document: Document
  tagging: DocumentTagging | null
}

type ExtractionTagWaitResult =
  | { success: true, document: Document, tagging: DocumentTagging | null }
  | { success: false, message: string }

export type ExtractionConfirmView = {
  label: string
  icon: string
  disabled: boolean
  hint: string | null
}

export type ExtractionTagView = {
  state: 'pending' | 'tagged' | 'failed'
  icon: string
  title: string
  message: string
  docType: string | null
  tags: string[]
  members: string[]
  indexNote: string | null
  canRetry: boolean
}

function extractionFormatPercent(confidence: number | null): string {
  return confidence === null ? EXTRACTION_EMPTY_VALUE_LABEL : `${confidence.toFixed(1)}%`
}

function extractionFormatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(3)}%`
}

function extractionFormatNormalized(value: ExtractedValue): string | null {
  if (value.value === null || typeof value.value === 'boolean') return null
  return String(value.value) === value.rawValue ? null : String(value.value)
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

function extractionUnionBox(a: ExtractedBox, b: ExtractedBox): ExtractedBox {
  const left = Math.min(a.left, b.left)
  const top = Math.min(a.top, b.top)
  return { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top }
}

function extractionExpandBox(box: ExtractedBox): ExtractedBox {
  const width = Math.max(box.width, EXTRACTION_BOX_MIN.width)
  const height = Math.max(box.height, EXTRACTION_BOX_MIN.height)
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height }
}

function extractionBuildHighlight(item: ExtractionItem, rawBox: ExtractedBox, aspect: number, selectedId: string | null): ExtractionHighlightView {
  const box = extractionExpandBox(rawBox)
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

function extractionCenterCropSpan(start: number, size: number, span: number): number {
  return Math.min(Math.max(start + size / 2 - span / 2, 0), 1 - span)
}

function extractionBuildCrop(valueBox: ExtractedBox, labelBox: ExtractedBox | null, preview: DocumentPreviewPage): ExtractionCropView {
  const box = extractionExpandBox(valueBox)
  const withLabel = labelBox && extractionUnionBox(box, labelBox)
  const focus = withLabel && withLabel.width <= EXTRACTION_CROP_LABEL_REACH.width && withLabel.height <= EXTRACTION_CROP_LABEL_REACH.height ? withLabel : box
  const fitWidth = Math.max(focus.width + EXTRACTION_CROP_MARGIN.x * 2, EXTRACTION_CROP_MIN_WIDTH)
  const fitHeight = focus.height + EXTRACTION_CROP_MARGIN.y * 2
  const width = Math.min(1, Math.max(fitWidth, fitHeight * preview.aspect / EXTRACTION_CROP_FRAME_RATIO.max))
  const height = Math.min(1, Math.max(fitHeight, width * EXTRACTION_CROP_FRAME_RATIO.min / preview.aspect))
  const left = extractionCenterCropSpan(focus.left, focus.width, width)
  const top = extractionCenterCropSpan(focus.top, focus.height, height)
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

function extractionFormatReadAs(item: ExtractionItem): string {
  if (item.kind === 'checkbox') return item.source.value === null ? 'Nothing detected' : item.source.value ? 'Checked' : 'Unchecked'
  return item.source.rawValue === null ? 'Nothing detected' : item.source.rawValue === '' ? 'Empty' : item.source.rawValue
}

function extractionBuildSelected(item: ExtractionItem, flagged: ExtractionItem[], unresolved: number, previews: DocumentPreviewPage[] | null): ExtractionSelectedView {
  const preview = previews?.[item.page - 1]
  const flaggedIndex = flagged.indexOf(item)
  const readAs = extractionFormatReadAs(item)
  return {
    id: item.id,
    label: item.label,
    context: flaggedIndex === -1 ? 'Extracted field' : `Flagged field ${flaggedIndex + 1} of ${flagged.length}`,
    guidance: EXTRACTION_GUIDANCE[item.status],
    kind: item.kind,
    text: item.text,
    checked: item.checked,
    readAs,
    readAsMissing: item.kind === 'checkbox' ? item.source.value === null : !item.source.rawValue,
    normalizedLabel: extractionFormatNormalized(item.source),
    changedFrom: item.edited ? readAs : null,
    confidenceLabel: EXTRACTION_CONFIDENCE_LABELS[item.source.confidenceLevel],
    confidencePercent: extractionFormatPercent(item.source.confidence),
    confidenceLevel: item.source.confidenceLevel,
    issues: item.source.issues,
    status: item.status,
    statusLabel: EXTRACTION_STATUS_LABELS[item.status],
    statusIcon: EXTRACTION_STATUS_ICONS[item.status],
    canConfirm: item.status === 'review',
    canUnconfirm: item.status === 'confirmed',
    canRevert: item.edited,
    canGoNext: item.status !== 'review' && unresolved > 0,
    pageLabel: `Page ${item.page}`,
    locationNote: item.box ? null : "We couldn't find this field on the page. Enter the value if you know it.",
    crop: item.box && preview ? extractionBuildCrop(item.box, item.labelBox, preview) : null,
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
    confirmHint: flagged.length === resolved ? null : `${flagged.length - resolved} flagged ${flagged.length - resolved === 1 ? 'field' : 'fields'} not reviewed yet`,
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
    selected: selected ? extractionBuildSelected(selected, flagged, flagged.length - resolved, previews) : null,
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

      const { document, extraction, review, tagging } = res.data
      if (document.status === 'extracted' && extraction) return { success: true, document, data: extraction, review, tagging }
      if (document.status === 'failed') return { success: false, message: document.failureMessage ?? EXTRACTION_ERRORS.WAIT_TIMED_OUT.MESSAGE }

      await settled
      if (signal.aborted) return null
    }
    return { success: false, message: EXTRACTION_ERRORS.WAIT_TIMED_OUT.MESSAGE }
  } finally {
    unwatch()
  }
}

async function extractionUploadAndWait(file: File, clientId: string | undefined, signal: AbortSignal, onUploaded: () => void): Promise<ExtractionWaitResult | null> {
  const res = await apiUploadRequest(uploadDocumentApi, { fileName: file.name, clientId }, file)
  if (signal.aborted) return null
  if (!res.success) return { success: false, message: res.error.message }

  onUploaded()
  return extractionWaitForDocument(res.data.document.id, signal)
}

async function extractionWaitForTagging(documentId: string, signal: AbortSignal): Promise<ExtractionTagWaitResult | null> {
  const unwatch = socketWatch(documentsWatch, { documentId })
  const deadline = Date.now() + EXTRACTION_TAG_WAIT_MAX_MS

  try {
    while (Date.now() < deadline) {
      const timeoutMs = socketLayer.getSnapshot() === 'connected' ? EXTRACTION_CHECK_CONNECTED_MS : EXTRACTION_CHECK_DISCONNECTED_MS
      const settled = socketAwait(documentsTagSettled, (payload) => payload.documentId === documentId, { timeoutMs, signal })
      const res = await apiGetRequest(getDocumentApi, { documentId })
      if (signal.aborted) return null
      if (!res.success) return { success: false, message: res.error.message }
      if (res.data.document.tagStatus !== 'pending') return { success: true, document: res.data.document, tagging: res.data.tagging }

      await settled
      if (signal.aborted) return null
    }
    return { success: false, message: EXTRACTION_ERRORS.TAG_WAIT_TIMED_OUT.MESSAGE }
  } finally {
    unwatch()
  }
}

function extractionBuildReviewedFields(items: ExtractionItem[]): Record<string, DocumentReviewField> {
  return Object.fromEntries(items
    .filter((item) => item.status === 'confirmed' || item.status === 'edited')
    .map((item) => [item.id, { value: item.kind === 'checkbox' ? item.checked : item.text, corrected: item.edited }]))
}

function extractionRestoreReview(review: DocumentReview | null) {
  const fields = Object.entries(review?.fields ?? {})
  return {
    edits: Object.fromEntries(fields.filter(([, field]) => field.corrected).map(([id, field]) => [id, field.value])),
    confirmed: Object.fromEntries(fields.filter(([, field]) => !field.corrected).map(([id]) => [id, true])),
  }
}

function extractionLogTagging(fileName: string, document: Document, tagging: DocumentTagging | null) {
  if (document.tagStatus === 'failed') return console.warn(`[tagging] ${fileName} failed:`, document.tagFailureMessage)
  if (document.tagStatus !== 'tagged' || !tagging) return
  console.info(`[tagging] ${fileName}`, {
    docType: tagging.docType?.choice ?? null,
    tags: tagging.tags.map((tag) => `${tag.name} (${tag.source})`),
    members: tagging.members.map((member) => ({ id: member.memberId, name: member.name, basis: member.basis })),
    readyToIndex: document.indexStatus === 'pending',
    taggedAt: tagging.taggedAt,
    evidence: Object.fromEntries([
      ...(tagging.docType ? [['docType', tagging.docType.evidence]] : []),
      ...tagging.tags.map((tag) => [`tag_${tag.name}`, tag.evidence]),
      ...tagging.members.map((member) => [member.name, member.evidence]),
    ]),
  })
}

const EXTRACTION_TOPIC_LABELS: Record<string, string> = {
  income: 'Income',
  retirement: 'Retirement',
  tax: 'Tax',
  self_employment: 'Self-employment',
  health_savings: 'Health savings',
  banking_cash: 'Cash and banking',
  investments: 'Investments',
  mortgage_housing: 'Home and mortgage',
  insurance: 'Insurance',
  estate: 'Estate',
  education: 'Education',
  life_event: 'Life event',
  equity_compensation: 'Equity compensation',
  debt: 'Debt',
  charitable_giving: 'Charitable giving',
  social_security: 'Social Security and Medicare',
}

function extractionFormatTagName(name: string): string {
  return EXTRACTION_TOPIC_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')
}

function extractionBuildTagView(state: ExtractionTagState): ExtractionTagView | null {
  const { document, tagging } = state
  if (document.tagStatus === 'pending') {
    return { state: 'pending', icon: 'progress_activity', title: 'Tagging', message: 'Finding the document type, topics and family members…', docType: null, tags: [], members: [], indexNote: null, canRetry: false }
  }
  if (document.tagStatus === 'failed') {
    return { state: 'failed', icon: 'error', title: "Tagging didn't finish", message: document.tagFailureMessage ?? EXTRACTION_ERRORS.TAG_WAIT_TIMED_OUT.MESSAGE, docType: null, tags: [], members: [], indexNote: null, canRetry: true }
  }
  if (document.tagStatus !== 'tagged' || !tagging) return null
  const docType = tagging.docType ? EXTRACTION_DOC_TYPE_LABELS[tagging.docType.choice] ?? extractionFormatTagName(tagging.docType.choice) : null
  return {
    state: 'tagged',
    icon: 'sell',
    title: 'Tagged',
    message: 'Confirmed values are saved as verified.',
    docType,
    tags: tagging.tags.map((tag) => extractionFormatTagName(tag.name)),
    members: tagging.members.map((member) => member.name),
    indexNote: document.indexStatus === 'pending' ? 'Ready to add to client search' : "Not linked to a client, so it won't be added to search",
    canRetry: false,
  }
}

function extractionBuildConfirm(review: ExtractionReviewView, tag: ExtractionTagState | null, confirming: boolean): ExtractionConfirmView {
  const pending = confirming || tag?.document.tagStatus === 'pending'
  const again = tag?.document.tagStatus === 'tagged' || tag?.document.tagStatus === 'failed'
  return {
    label: pending ? 'Tagging…' : again ? 'Confirm & tag again' : 'Confirm & tag',
    icon: pending ? 'progress_activity' : 'sell',
    disabled: pending || review.unresolved > 0,
    hint: review.confirmHint,
  }
}

async function extractionFetchDocumentFile(documentId: string, signal: AbortSignal): Promise<{ success: true, file: File } | { success: false, message: string } | null> {
  const [content, details] = await Promise.all([
    apiGetRequest(getDocumentContentApi, { documentId }, { responseType: 'blob', signal }),
    apiGetRequest(getDocumentApi, { documentId }, { signal }),
  ])
  if (signal.aborted) return null
  if (!content.success) return { success: false, message: content.error.message }
  if (!details.success) return { success: false, message: details.error.message }
  return { success: true, file: new File([content.data], details.data.document.fileName, { type: content.data.type }) }
}

export function useExtractionUpload() {
  const { clientId: clientSlug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const clientsQuery = useApiGetQuery(listClientsApi)
  const client = clientsQuery.data?.clients.find((item) => item.slug === clientSlug) ?? null
  const mode: ExtractionMode = searchParams.get(EXTRACTION_MODE_PARAM) === 'request' ? 'request' : 'self'
  const openDocumentId = searchParams.get(EXTRACTION_DOCUMENT_PARAM)

  const [phase, setPhase] = useState<ExtractionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ExtractionAnalysis | null>(null)
  const [previews, setPreviews] = useState<DocumentPreviewPage[] | null>(null)
  const [edits, setEdits] = useState<Record<string, ExtractionEditValue>>({})
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tagState, setTagState] = useState<ExtractionTagState | null>(null)
  const [confirming, setConfirming] = useState(false)
  const uploadAbort = useRef<AbortController | null>(null)
  const tagAbort = useRef<AbortController | null>(null)

  useEffect(() => () => {
    if (previews) documentPreviewRelease(previews)
  }, [previews])

  useEffect(() => () => {
    uploadAbort.current?.abort()
    tagAbort.current?.abort()
  }, [])

  useEffect(() => {
    if (!openDocumentId) return
    const abort = extractionStart()
    setPhase('opening')
    void extractionOpen(openDocumentId, abort.signal)
  }, [openDocumentId])

  const result = useMemo(() => {
    if (!analysis) return null
    const { data } = analysis
    const items = extractionBuildItems(data, edits, confirmed)
    const review = extractionBuildReview(items, previews, selectedId)
    return {
      items,
      review,
      confirm: extractionBuildConfirm(review, tagState, confirming),
      tag: tagState ? extractionBuildTagView(tagState) : null,
      summary: `${analysis.fileName} · ${analysis.pageCount} ${analysis.pageCount === 1 ? 'page' : 'pages'} · ${review.unresolved} of ${review.total} left to review`,
      document: {
        pages: extractionBuildPages(items, previews, selectedId),
        previewMessage: previews ? null : EXTRACTION_ERRORS.PREVIEW_UNAVAILABLE.MESSAGE,
      } satisfies ExtractionDocumentView,
    }
  }, [analysis, previews, edits, confirmed, selectedId, tagState, confirming])

  function extractionStart() {
    uploadAbort.current?.abort()
    tagAbort.current?.abort()
    const abort = new AbortController()
    uploadAbort.current = abort
    setError(null)
    setAnalysis(null)
    setPreviews(null)
    setTagState(null)
    return abort
  }

  function extractionShow(file: File, result: ExtractionWaitResult | null, pages: DocumentPreviewPage[] | null) {
    if (!result || !result.success) {
      if (pages) documentPreviewRelease(pages)
      if (!result) return
      setPhase('idle')
      setError(result.message)
      return
    }
    const restored = extractionRestoreReview(result.review)
    setPhase('idle')
    setEdits(restored.edits)
    setConfirmed(restored.confirmed)
    setSelectedId(null)
    setPreviews(pages)
    setAnalysis({ documentId: result.document.id, fileName: file.name, pageCount: result.document.pageCount ?? 1, data: result.data })
    if (!result.document.tagStatus) return
    setTagState({ document: result.document, tagging: result.tagging })
    extractionLogTagging(file.name, result.document, result.tagging)
    if (result.document.tagStatus === 'pending') void extractionFollowTagging(result.document.id)
  }

  async function extractionFollowTagging(documentId: string) {
    tagAbort.current?.abort()
    const abort = new AbortController()
    tagAbort.current = abort
    const settled = await extractionWaitForTagging(documentId, abort.signal)
    if (!settled) return
    if (!settled.success) {
      setError(settled.message)
      return
    }
    setTagState({ document: settled.document, tagging: settled.tagging })
    extractionLogTagging(settled.document.fileName, settled.document, settled.tagging)
  }

  async function extractionOpen(documentId: string, signal: AbortSignal) {
    const fetched = await extractionFetchDocumentFile(documentId, signal)
    if (!fetched) return
    if (!fetched.success) {
      setPhase('idle')
      setError(fetched.message)
      return
    }
    setPhase('extracting')
    const [result, pages] = await Promise.all([
      extractionWaitForDocument(documentId, signal),
      documentPreviewRender(fetched.file),
    ])
    extractionShow(fetched.file, result, pages)
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const invalid = documentUploadCheckFile(file)
    if (invalid) {
      setError(invalid.MESSAGE)
      return
    }

    if (openDocumentId) extractionClearDocumentParam()
    const abort = extractionStart()
    setPhase('uploading')
    const [result, pages] = await Promise.all([
      extractionUploadAndWait(file, client?.id, abort.signal, () => setPhase('extracting')),
      documentPreviewRender(file),
    ])
    extractionShow(file, result, pages)
  }

  function extractionClearDocumentParam() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.delete(EXTRACTION_DOCUMENT_PARAM)
      return next
    })
  }

  function selectMode(next: ExtractionMode) {
    setSearchParams((params) => {
      const updated = new URLSearchParams(params)
      if (next === 'request') updated.set(EXTRACTION_MODE_PARAM, next)
      else updated.delete(EXTRACTION_MODE_PARAM)
      return updated
    })
  }

  function reviewDocument(documentId: string) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.delete(EXTRACTION_MODE_PARAM)
      next.set(EXTRACTION_DOCUMENT_PARAM, documentId)
      return next
    })
  }

  function edit(id: string, value: ExtractionEditValue) {
    setEdits((current) => ({ ...current, [id]: value }))
  }

  function confirm(id: string) {
    setConfirmed((current) => ({ ...current, [id]: true }))
  }

  function unconfirm(id: string) {
    setConfirmed((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)))
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

  async function confirmAndTag() {
    if (!analysis || !result || result.confirm.disabled) return
    setConfirming(true)
    setError(null)
    const res = await apiPostRequest(confirmDocumentApi, { documentId: analysis.documentId, fields: extractionBuildReviewedFields(result.items) })
    setConfirming(false)
    if (!res.success) {
      setError(res.error.message)
      return
    }
    setTagState({ document: res.data.document, tagging: null })
    void extractionFollowTagging(analysis.documentId)
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
    unconfirm,
    revert,
    select,
    focusItem,
    focusNext,
    confirmAndTag,
    accept: DOCUMENT_UPLOAD_ACCEPT,
    hint: DOCUMENT_UPLOAD_HINT,
    mode,
    modes: EXTRACTION_MODE_OPTIONS.map((option) => ({ ...option, selected: option.mode === mode })),
    selectMode,
    client,
    reviewDocument,
  }
}
