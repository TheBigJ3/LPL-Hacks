import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router'
import type { ExtractedAnalysis } from '@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis'
import type { ExtractedBox } from '@lpl-hacks/shared/src/types/native/extraction/extractedBox'
import type { ExtractedTable } from '@lpl-hacks/shared/src/types/native/extraction/extractedTable'
import type { ExtractedConfidenceLevel, ExtractedValue } from '@lpl-hacks/shared/src/types/native/extraction/extractedValue'
import documentsExtractionSettled from '@lpl-hacks/shared/src/types/native/sockets/documents/extractionSettled'
import documentsWatch from '@lpl-hacks/shared/src/types/native/sockets/documents/watch'
import listClientsApi from '@api/clients/listClientsApi'
import getDocumentApi from '@api/documents/getDocumentApi'
import getDocumentContentApi from '@api/documents/getDocumentContentApi'
import uploadDocumentApi from '@api/documents/uploadDocumentApi'
import { apiGetRequest, apiUploadRequest, useApiGetQuery } from '@features/apiLayer'
import { DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_HINT, documentUploadCheckFile } from '@features/documentUploadCheck'
import { documentPreviewRelease, documentPreviewRender, type DocumentPreviewPage } from '@features/documentPreview'
import { fileDownloadJson } from '@features/fileDownload'
import { socketAwait, socketLayer, socketWatch } from '@stores/socketStore'
import { EXTRACTION_ERRORS } from '@typings/native/extraction/errors'

export const EXTRACTION_EMPTY_VALUE_LABEL = '—'
export const EXTRACTION_EDITOR_DOM_ID = 'extraction-review-editor'
export const EXTRACTION_INPUT_DOM_ID = 'extraction-review-input'
export const EXTRACTION_DOCUMENT_DOM_ID = 'extraction-document'

const EXTRACTION_CROP_MARGIN = { x: 0.02, y: 0.012 }
const EXTRACTION_CROP_MIN_WIDTH = 0.16
const EXTRACTION_CROP_FRAME_RATIO = { min: 0.3, max: 0.9 }
const EXTRACTION_CROP_LABEL_REACH = { width: 0.45, height: 0.08 }
const EXTRACTION_BOX_MIN = { width: 0.02, height: 0.01 }
const EXTRACTION_HIGHLIGHT_PADDING = 0.003
const EXTRACTION_WAIT_MAX_MS = 20 * 60 * 1000
const EXTRACTION_CHECK_CONNECTED_MS = 10_000
const EXTRACTION_CHECK_DISCONNECTED_MS = 3_000
const EXTRACTION_PROGRESS_FALLBACK_NAME = 'Client upload'

export type ExtractionPhase = 'idle' | 'uploading' | 'opening' | 'extracting'

export type ExtractionProgressStepState = 'done' | 'active' | 'pending'

export type ExtractionProgressView = {
  fileName: string
  steps: { number: number, label: string, hint: string, state: ExtractionProgressStepState }[]
}

const EXTRACTION_PROGRESS_STEPS = [
  { label: 'Upload the file', hint: 'Sending it to secure storage' },
  { label: 'Read the document', hint: 'Finding every field and table. Usually under a minute' },
  { label: 'Check flagged fields', hint: "You'll confirm anything we weren't sure about" },
]

const EXTRACTION_PROGRESS_OPEN_STEP = { label: 'Open the client upload', hint: 'Loading the file your client sent' }

export type ExtractionMode = 'self' | 'request'

type ExtractionSource = 'upload' | 'request'

const EXTRACTION_MODE_PARAM = 'mode'
const EXTRACTION_DOCUMENT_PARAM = 'document'

export const EXTRACTION_MODE_OPTIONS: { mode: ExtractionMode, icon: string, title: string, hint: string }[] = [
  { mode: 'self', icon: 'upload_file', title: 'Upload files myself', hint: 'Extract and review a document now' },
  { mode: 'request', icon: 'add_link', title: 'Request from client', hint: 'Send a link they can upload one set of files with' },
]

export type ExtractionEditValue = string | boolean

export type ExtractionItemStatus = 'review' | 'edited' | 'confirmed' | 'plain'

export type ExtractionPanelView = 'check' | 'all'

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
  review: 'To check',
  edited: 'Corrected',
  confirmed: 'Confirmed',
  plain: 'Not flagged',
}

const EXTRACTION_STATUS_ICONS: Record<ExtractionItemStatus, string> = {
  review: 'error',
  edited: 'edit',
  confirmed: 'check_circle',
  plain: 'check',
}

const EXTRACTION_GUIDANCE: Record<ExtractionItemStatus, string> = {
  review: 'If it matches the document, confirm it. If not, type what the document says.',
  edited: 'Your correction will be used instead of what we read.',
  confirmed: 'You confirmed this value matches the document.',
  plain: "This field wasn't flagged. Change it only if it's wrong.",
}

const EXTRACTION_CONFIDENCE_LABELS: Record<ExtractedConfidenceLevel, string> = {
  high: 'High certainty',
  medium: 'Medium certainty',
  low: 'Low certainty',
  unknown: 'Certainty unknown',
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

export type ExtractionToolbarView = {
  fileName: string
  meta: string
  progressLabel: string
  progressStyle: CSSProperties
  complete: boolean
  backLabel: string
  backIcon: string
}

export type ExtractionReviewListItem = {
  id: string
  label: string
  summary: string
  status: ExtractionItemStatus
  icon: string
  selected: boolean
}

export type ExtractionReviewGroup = {
  title: string
  items: ExtractionReviewListItem[]
}

export type ExtractionCropView = {
  imageUrl: string
  frameStyle: CSSProperties
  imageStyle: CSSProperties
  markerStyle: CSSProperties
}

export type ExtractionStepperView = {
  label: string
  canPrev: boolean
  canNext: boolean
  steps: { id: string, label: string, status: ExtractionItemStatus, selected: boolean }[]
}

export type ExtractionSelectedView = {
  id: string
  label: string
  kind: 'text' | 'checkbox'
  status: ExtractionItemStatus
  statusLabel: string
  statusIcon: string
  guidance: string
  readAs: string
  readAsMissing: boolean
  normalizedLabel: string | null
  confidenceLabel: string
  confidencePercent: string
  confidenceLevel: ExtractedConfidenceLevel
  issues: string[]
  text: string
  checked: boolean
  changed: boolean
  submitLabel: string
  submitIcon: string
  canSkip: boolean
  canUndo: boolean
  pageLabel: string
  locationNote: string | null
  crop: ExtractionCropView | null
}

export type ExtractionDoneView = {
  title: string
  subtitle: string
  complete: boolean
  stats: { label: string, value: number, status: ExtractionItemStatus }[]
}

export type ExtractionReviewView = {
  view: ExtractionPanelView
  tabs: { view: ExtractionPanelView, label: string, count: string, selected: boolean }[]
  unresolved: number
  stepper: ExtractionStepperView
  selected: ExtractionSelectedView | null
  done: ExtractionDoneView
  groups: ExtractionReviewGroup[]
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

function extractionOmit<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key))
}

function extractionItemCurrent(item: ExtractionItem): ExtractionEditValue {
  return item.kind === 'checkbox' ? item.checked : item.text
}

function extractionItemOriginal(item: ExtractionItem): ExtractionEditValue {
  return item.kind === 'checkbox' ? item.source.value === true : item.source.rawValue ?? ''
}

function extractionItemSaved(item: ExtractionItem, value: ExtractionEditValue): boolean {
  return value === extractionItemCurrent(item) && item.status !== 'review'
}

function extractionFindNextOpen(items: ExtractionItem[], fromId: string | null): ExtractionItem | null {
  const flagged = items.filter((item) => item.source.requiresReview)
  const start = flagged.findIndex((item) => item.id === fromId)
  return [...flagged.slice(start + 1), ...flagged.slice(0, start + 1)].find((item) => item.status === 'review' && item.id !== fromId) ?? null
}

function extractionBuildSubmit(item: ExtractionItem, value: ExtractionEditValue, hasNextOpen: boolean): { label: string, icon: string } {
  const saved = extractionItemSaved(item, value)
  if (!saved && value !== extractionItemOriginal(item)) return { label: 'Save correction', icon: 'edit' }
  if (!saved && item.source.requiresReview) return { label: 'Confirm value', icon: 'check' }
  if (!item.source.requiresReview) return { label: 'Back to all fields', icon: 'arrow_back' }
  return hasNextOpen ? { label: 'Next field', icon: 'arrow_forward' } : { label: 'Finish review', icon: 'done_all' }
}

function extractionBuildSelected(item: ExtractionItem, draft: ExtractionEditValue | null, hasNextOpen: boolean, previews: DocumentPreviewPage[] | null): ExtractionSelectedView {
  const preview = previews?.[item.page - 1]
  const value = draft ?? extractionItemCurrent(item)
  const submit = extractionBuildSubmit(item, value, hasNextOpen)
  return {
    id: item.id,
    label: item.label,
    kind: item.kind,
    status: item.status,
    statusLabel: EXTRACTION_STATUS_LABELS[item.status],
    statusIcon: EXTRACTION_STATUS_ICONS[item.status],
    guidance: EXTRACTION_GUIDANCE[item.status],
    readAs: extractionFormatReadAs(item),
    readAsMissing: item.kind === 'checkbox' ? item.source.value === null : !item.source.rawValue,
    normalizedLabel: extractionFormatNormalized(item.source),
    confidenceLabel: EXTRACTION_CONFIDENCE_LABELS[item.source.confidenceLevel],
    confidencePercent: extractionFormatPercent(item.source.confidence),
    confidenceLevel: item.source.confidenceLevel,
    issues: item.source.issues,
    text: typeof value === 'string' ? value : item.text,
    checked: typeof value === 'boolean' ? value : item.checked,
    changed: value !== extractionItemOriginal(item),
    submitLabel: submit.label,
    submitIcon: submit.icon,
    canSkip: item.status === 'review' && hasNextOpen,
    canUndo: item.status === 'confirmed' || item.status === 'edited',
    pageLabel: `Page ${item.page}`,
    locationNote: item.box ? null : "We couldn't find this field on the page. Enter the value if you know it.",
    crop: item.box && preview ? extractionBuildCrop(item.box, item.labelBox, preview) : null,
  }
}

function extractionBuildStepper(flagged: ExtractionItem[], selectedId: string | null, selected: ExtractionItem | undefined): ExtractionStepperView {
  const index = flagged.findIndex((item) => item.id === selectedId)
  return {
    label: index !== -1 ? `Field ${index + 1} of ${flagged.length}` : selected ? 'Not a flagged field' : '',
    canPrev: index > 0,
    canNext: index !== -1 && index < flagged.length - 1,
    steps: flagged.map((item) => ({ id: item.id, label: `${item.label}: ${EXTRACTION_STATUS_LABELS[item.status]}`, status: item.status, selected: item.id === selectedId })),
  }
}

function extractionBuildDone(items: ExtractionItem[], flagged: ExtractionItem[], unresolved: number): ExtractionDoneView {
  const stats = [
    { label: 'Confirmed', value: flagged.filter((item) => item.status === 'confirmed').length, status: 'confirmed' as const },
    { label: 'Corrected', value: items.filter((item) => item.status === 'edited').length, status: 'edited' as const },
  ]
  if (flagged.length === 0) return {
    title: 'Nothing needed checking',
    subtitle: 'Every field was read with high certainty. You can still look them over in All fields.',
    complete: true,
    stats: [],
  }
  if (unresolved === 0) return {
    title: 'All flagged fields checked',
    subtitle: 'Download the data, or look over every field before you go.',
    complete: true,
    stats,
  }
  return {
    title: `${unresolved} ${unresolved === 1 ? 'field' : 'fields'} left to check`,
    subtitle: 'Pick up where you left off.',
    complete: false,
    stats,
  }
}

function extractionBuildListItem(item: ExtractionItem, selectedId: string | null, summary: string): ExtractionReviewListItem {
  return {
    id: item.id,
    label: item.label,
    summary,
    status: item.status,
    icon: EXTRACTION_STATUS_ICONS[item.status],
    selected: item.id === selectedId,
  }
}

function extractionBuildGroups(items: ExtractionItem[], selectedId: string | null): ExtractionReviewGroup[] {
  const groups: ExtractionReviewGroup[] = [
    {
      title: 'Flagged',
      items: items
        .filter((item) => item.source.requiresReview)
        .map((item) => extractionBuildListItem(item, selectedId, item.status === 'review'
          ? item.source.issues[0] ?? EXTRACTION_STATUS_LABELS.review
          : `${EXTRACTION_STATUS_LABELS[item.status]} · ${extractionFormatItemValue(item)}`)),
    },
    {
      title: 'Read from the page',
      items: items
        .filter((item) => item.box !== null && !item.source.requiresReview)
        .map((item) => extractionBuildListItem(item, selectedId, item.edited ? `Corrected · ${extractionFormatItemValue(item)}` : extractionFormatItemValue(item))),
    },
    {
      title: 'Not found on the page',
      items: items
        .filter((item) => item.box === null && !item.source.requiresReview)
        .map((item) => extractionBuildListItem(item, selectedId, item.edited ? `Filled in · ${item.text}` : 'Missing')),
    },
  ]
  return groups.filter((group) => group.items.length > 0)
}

function extractionBuildReview(
  items: ExtractionItem[],
  previews: DocumentPreviewPage[] | null,
  selectedId: string | null,
  draft: ExtractionEditValue | null,
  view: ExtractionPanelView,
): ExtractionReviewView {
  const flagged = items.filter((item) => item.source.requiresReview)
  const unresolved = flagged.filter((item) => item.status === 'review').length
  const selected = items.find((item) => item.id === selectedId)
  return {
    view,
    tabs: [
      { view: 'check', label: 'Check', count: flagged.length === 0 || unresolved === 0 ? 'Done' : `${unresolved} left`, selected: view === 'check' },
      { view: 'all', label: 'All fields', count: String(items.length), selected: view === 'all' },
    ],
    unresolved,
    stepper: extractionBuildStepper(flagged, selectedId, selected),
    selected: selected ? extractionBuildSelected(selected, draft, !!extractionFindNextOpen(items, selected.id), previews) : null,
    done: extractionBuildDone(items, flagged, unresolved),
    groups: extractionBuildGroups(items, selectedId),
  }
}

function extractionBuildToolbar(analysis: ExtractionAnalysis, items: ExtractionItem[], source: ExtractionSource): ExtractionToolbarView {
  const flagged = items.filter((item) => item.source.requiresReview)
  const resolved = flagged.filter((item) => item.status !== 'review').length
  return {
    fileName: analysis.fileName,
    meta: `${analysis.pageCount} ${analysis.pageCount === 1 ? 'page' : 'pages'} · ${items.length} fields read`,
    progressLabel: flagged.length === 0 ? 'Nothing to check' : `${resolved} of ${flagged.length} checked`,
    progressStyle: { width: extractionFormatRatio(flagged.length === 0 ? 1 : resolved / flagged.length) },
    complete: resolved === flagged.length,
    backLabel: source === 'request' ? 'Back to requests' : 'New document',
    backIcon: source === 'request' ? 'arrow_back' : 'add',
  }
}

function extractionBuildProgress(phase: Exclude<ExtractionPhase, 'idle'>, fileName: string | null): ExtractionProgressView {
  const active = phase === 'extracting' ? 1 : 0
  const steps = phase === 'opening' ? [EXTRACTION_PROGRESS_OPEN_STEP, ...EXTRACTION_PROGRESS_STEPS.slice(1)] : EXTRACTION_PROGRESS_STEPS
  return {
    fileName: fileName ?? EXTRACTION_PROGRESS_FALLBACK_NAME,
    steps: steps.map((step, index): ExtractionProgressView['steps'][number] => ({ ...step, number: index + 1, state: index < active ? 'done' : index === active ? 'active' : 'pending' })),
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
  const column = document.getElementById(EXTRACTION_DOCUMENT_DOM_ID)
  if (!highlight || !column) return
  const offset = highlight.getBoundingClientRect().top - column.getBoundingClientRect().top
  column.scrollTo({ top: column.scrollTop + offset - column.clientHeight / 2, behavior: 'smooth' })
}

function extractionFocusInput() {
  if (!window.matchMedia('(pointer: fine)').matches) return
  document.getElementById(EXTRACTION_INPUT_DOM_ID)?.focus({ preventScroll: true })
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

async function extractionUploadAndWait(file: File, clientId: string | undefined, signal: AbortSignal, onUploaded: () => void): Promise<ExtractionWaitResult | null> {
  const res = await apiUploadRequest(uploadDocumentApi, { fileName: file.name, clientId }, file)
  if (signal.aborted) return null
  if (!res.success) return { success: false, message: res.error.message }

  onUploaded()
  return extractionWaitForDocument(res.data.document.id, signal)
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
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [source, setSource] = useState<ExtractionSource>('upload')
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ExtractionAnalysis | null>(null)
  const [previews, setPreviews] = useState<DocumentPreviewPage[] | null>(null)
  const [edits, setEdits] = useState<Record<string, ExtractionEditValue>>({})
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ExtractionEditValue | null>(null)
  const [view, setView] = useState<ExtractionPanelView>('check')
  const uploadAbort = useRef<AbortController | null>(null)

  useEffect(() => () => {
    if (previews) documentPreviewRelease(previews)
  }, [previews])

  useEffect(() => () => uploadAbort.current?.abort(), [])

  useEffect(() => {
    if (!openDocumentId) return
    const abort = extractionStart()
    setSource('request')
    setPendingName(null)
    setPhase('opening')
    void extractionOpen(openDocumentId, abort.signal)
  }, [openDocumentId])

  const result = useMemo(() => {
    if (!analysis) return null
    const items = extractionBuildItems(analysis.data, edits, confirmed)
    return {
      items,
      toolbar: extractionBuildToolbar(analysis, items, source),
      review: extractionBuildReview(items, previews, selectedId, draft, view),
      document: {
        pages: extractionBuildPages(items, previews, selectedId),
        previewMessage: previews ? null : EXTRACTION_ERRORS.PREVIEW_UNAVAILABLE.MESSAGE,
      } satisfies ExtractionDocumentView,
    }
  }, [analysis, previews, edits, confirmed, selectedId, draft, view, source])

  function extractionStart() {
    uploadAbort.current?.abort()
    const abort = new AbortController()
    uploadAbort.current = abort
    setError(null)
    setAnalysis(null)
    setPreviews(null)
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
    const first = extractionBuildItems(result.data, {}, {}).find((item) => item.source.requiresReview)
    setPhase('idle')
    setEdits({})
    setConfirmed({})
    setDraft(null)
    setView('check')
    setSelectedId(first?.id ?? null)
    setPreviews(pages)
    setAnalysis({ documentId: result.documentId, fileName: file.name, pageCount: result.pageCount, data: result.data })
    if (first) requestAnimationFrame(extractionFocusInput)
  }

  async function extractionOpen(documentId: string, signal: AbortSignal) {
    const fetched = await extractionFetchDocumentFile(documentId, signal)
    if (!fetched) return
    if (!fetched.success) {
      setPhase('idle')
      setError(fetched.message)
      return
    }
    setPendingName(fetched.file.name)
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

    if (openDocumentId) extractionClearDocumentParam(false)
    const abort = extractionStart()
    setSource('upload')
    setPendingName(file.name)
    setPhase('uploading')
    const [result, pages] = await Promise.all([
      extractionUploadAndWait(file, client?.id, abort.signal, () => setPhase('extracting')),
      documentPreviewRender(file),
    ])
    extractionShow(file, result, pages)
  }

  function extractionClearDocumentParam(backToRequests: boolean) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.delete(EXTRACTION_DOCUMENT_PARAM)
      if (backToRequests) next.set(EXTRACTION_MODE_PARAM, 'request')
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

  function startOver() {
    uploadAbort.current?.abort()
    setPhase('idle')
    setError(null)
    setAnalysis(null)
    setPreviews(null)
    setSelectedId(null)
    setDraft(null)
    if (openDocumentId || source === 'request') extractionClearDocumentParam(source === 'request')
  }

  function extractionGoTo(id: string | null) {
    setSelectedId(id)
    setDraft(null)
    setView('check')
    if (!id) return
    requestAnimationFrame(() => {
      extractionRevealItem(id)
      extractionFocusInput()
    })
  }

  function pickHighlight(id: string) {
    setSelectedId(id)
    setDraft(null)
    setView('check')
    requestAnimationFrame(extractionRevealEditor)
  }

  function step(offset: number) {
    const flagged = result?.items.filter((item) => item.source.requiresReview) ?? []
    const index = flagged.findIndex((item) => item.id === selectedId)
    const next = flagged[index + offset]
    if (index !== -1 && next) extractionGoTo(next.id)
  }

  function skip() {
    if (!result) return
    extractionGoTo(extractionFindNextOpen(result.items, selectedId)?.id ?? null)
  }

  function changeValue(value: ExtractionEditValue) {
    setDraft(value)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const item = result?.items.find((entry) => entry.id === selectedId)
    if (!item || !result) return
    const value = draft ?? extractionItemCurrent(item)
    if (!extractionItemSaved(item, value)) {
      if (value !== extractionItemOriginal(item)) setEdits((current) => ({ ...current, [item.id]: value }))
      else {
        setEdits((current) => extractionOmit(current, item.id))
        if (item.source.requiresReview) setConfirmed((current) => ({ ...current, [item.id]: true }))
      }
    }
    if (!item.source.requiresReview) {
      setDraft(null)
      setView('all')
      return
    }
    extractionGoTo(extractionFindNextOpen(result.items, item.id)?.id ?? null)
  }

  function undo() {
    if (!selectedId) return
    setEdits((current) => extractionOmit(current, selectedId))
    setConfirmed((current) => extractionOmit(current, selectedId))
    setDraft(null)
    requestAnimationFrame(extractionFocusInput)
  }

  function showView(next: ExtractionPanelView) {
    setView(next)
    if (next === 'check' && result && !result.review.selected) extractionGoTo(extractionFindNextOpen(result.items, null)?.id ?? null)
  }

  function download() {
    if (!analysis || !result) return
    fileDownloadJson(`${analysis.fileName.replace(/\.[^.]+$/, '')}.json`, extractionBuildExport(analysis, result.items, edits, confirmed))
  }

  return {
    busy: phase !== 'idle',
    progress: phase === 'idle' ? null : extractionBuildProgress(phase, pendingName),
    error,
    result,
    upload,
    startOver,
    pickHighlight,
    pickField: extractionGoTo,
    prev: () => step(-1),
    next: () => step(1),
    skip,
    changeValue,
    submit,
    undo,
    showView,
    download,
    accept: DOCUMENT_UPLOAD_ACCEPT,
    hint: DOCUMENT_UPLOAD_HINT,
    mode,
    modes: EXTRACTION_MODE_OPTIONS.map((option) => ({ ...option, selected: option.mode === mode })),
    selectMode,
    client,
    reviewDocument,
  }
}
