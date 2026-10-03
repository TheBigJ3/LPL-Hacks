import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react'
import type { Response as ExtractionAnalyzeResponse } from '@lpl-hacks/shared/src/types/native/api/v1/extraction/analyze'
import type { ExtractedBox } from '@lpl-hacks/shared/src/types/native/extraction/extractedBox'
import type { ExtractedLine } from '@lpl-hacks/shared/src/types/native/extraction/extractedField'
import type { ExtractedConfidenceLevel, ExtractedValue } from '@lpl-hacks/shared/src/types/native/extraction/extractedValue'
import analyzeApi from '@api/extraction/analyzeApi'
import { apiUploadRequest } from '@features/apiLayer'
import { documentPreviewRelease, documentPreviewRender, type DocumentPreviewPage } from '@features/documentPreview'
import { EXTRACTION_ERRORS } from '@typings/native/extraction/errors'

export const EXTRACTION_UPLOAD_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']
export const EXTRACTION_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const EXTRACTION_EMPTY_VALUE_LABEL = '—'
export const EXTRACTION_EDITOR_DOM_ID = 'extraction-review-editor'

const EXTRACTION_FALLBACK_PAGE_ASPECT = 11 / 8.5
const EXTRACTION_CROP_PADDING = { x: 0.05, y: 0.025 }
const EXTRACTION_FALLBACK_TEXT_HEIGHT = 0.014

export type ExtractionLayout = 'scan' | 'rebuilt'

export type ExtractionEditValue = string | boolean

type ExtractionItemStatus = 'review' | 'edited' | 'confirmed' | 'plain'

type ExtractionValueTone = 'filled' | 'blank' | 'missing'

type ExtractionCellTone = 'header' | 'label' | ExtractionItemStatus

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

export const EXTRACTION_VALUE_TONE_CLASSES: Record<ExtractionValueTone, string> = {
  filled: 'break-words text-main-white tabular-nums',
  blank: 'italic text-placeholder-gray',
  missing: 'italic text-placeholder-gray',
}

export const EXTRACTION_CONFIDENCE_PILL_CLASSES: Record<ExtractedConfidenceLevel, string> = {
  high: 'border-card-outlines text-paragraph-off-white',
  medium: 'border-paragraph-off-white/40 text-main-white',
  low: 'border-review-yellow/60 bg-review-yellow/15 text-review-yellow',
  unknown: 'border-card-outlines text-placeholder-gray',
}

export const EXTRACTION_CONFIDENCE_DOT_CLASSES: Record<ExtractedConfidenceLevel, string> = {
  high: 'bg-paragraph-off-white',
  medium: 'bg-main-white',
  low: 'bg-review-yellow',
  unknown: 'bg-placeholder-gray',
}

export const EXTRACTION_CELL_TONE_CLASSES: Record<ExtractionCellTone, string> = {
  header: 'bg-card-outlines-faint text-xs font-bold uppercase tracking-wider text-placeholder-gray',
  label: 'text-xs text-placeholder-gray',
  review: 'bg-review-yellow/15 text-review-yellow',
  edited: 'text-main-white shadow-[inset_0_-2px_0_0_var(--color-main-pink)]',
  confirmed: 'text-main-white',
  plain: 'text-main-white',
}

export const EXTRACTION_ROW_STATUS_CLASSES: Record<ExtractionItemStatus, string> = {
  review: 'shadow-[inset_3px_0_0_0_var(--color-review-yellow)]',
  edited: 'shadow-[inset_3px_0_0_0_var(--color-main-pink)]',
  confirmed: '',
  plain: '',
}

export const EXTRACTION_STATUS_BADGE_CLASSES: Record<ExtractionItemStatus, string> = {
  review: 'border-review-yellow/60 bg-review-yellow/15 text-review-yellow',
  edited: 'border-main-pink/50 bg-main-pink/10 text-main-pink',
  confirmed: 'border-card-outlines text-paragraph-off-white',
  plain: 'border-card-outlines text-placeholder-gray',
}

const EXTRACTION_STATUS_LABELS: Record<ExtractionItemStatus, string> = {
  review: 'Needs review',
  edited: 'Edited',
  confirmed: 'Approved',
  plain: 'Looks fine',
}

const EXTRACTION_OVERLAY_BASE_CLASSES: Record<ExtractionOverlayKind, string> = {
  text: 'absolute rounded-[2px] px-[0.2em] leading-none text-main-black transition-shadow [field-sizing:content] focus:outline-none',
  multiline: 'absolute resize-none overflow-hidden rounded-[2px] px-[0.2em] py-[0.1em] leading-[1.25] text-main-black transition-shadow [field-sizing:content] focus:outline-none',
  checkbox: 'absolute flex items-center justify-center rounded-[2px] text-main-black transition-shadow focus:outline-none',
}

const EXTRACTION_OVERLAY_TONE_CLASSES: Record<ExtractionItemStatus, string> = {
  review: 'bg-review-yellow-soft ring-2 ring-review-yellow hover:ring-[3px]',
  edited: 'bg-white ring-2 ring-main-pink/70',
  confirmed: 'bg-white ring-1 ring-black/15 hover:ring-black/40',
  plain: 'bg-white ring-1 ring-black/15 hover:ring-black/40',
}

const EXTRACTION_OVERLAY_EMPTY_CLASS = 'border border-dashed border-black/25 bg-transparent hover:bg-white/70 focus:bg-white'

const EXTRACTION_OVERLAY_CHECKBOX_CLASS = 'bg-white ring-1 ring-black/70 hover:ring-black'

const EXTRACTION_OVERLAY_PEEK_CLASSES: Record<ExtractionItemStatus, string> = {
  review: 'pointer-events-none bg-review-yellow/20 text-transparent ring-2 ring-review-yellow',
  edited: 'pointer-events-none bg-transparent text-transparent ring-2 ring-main-pink/70',
  confirmed: 'pointer-events-none bg-transparent text-transparent ring-1 ring-black/20',
  plain: 'pointer-events-none bg-transparent text-transparent ring-1 ring-black/20',
}

const EXTRACTION_OVERLAY_SELECTED_CLASS = 'outline-2 outline-offset-2 outline-main-pink'

const EXTRACTION_LAYOUT_ACTIVE_CLASS = 'bg-card-outlines text-main-white'
const EXTRACTION_LAYOUT_INACTIVE_CLASS = 'text-placeholder-gray hover:text-main-white disabled:opacity-40 disabled:hover:text-placeholder-gray'

export type ExtractionFieldRow = {
  id: string
  label: string
  page: number
  displayValue: string
  valueTone: ExtractionValueTone
  normalizedLabel: string | null
  originalLabel: string | null
  confidencePercent: string
  confidenceLevel: ExtractedConfidenceLevel
  status: ExtractionItemStatus
  statusLabel: string
  issues: string[]
}

export type ExtractionLineRow = ExtractedLine & {
  confidenceLabel: string
  requiresReview: boolean
}

export type ExtractionTableCellView = {
  id: string
  text: string
  normalizedLabel: string | null
  tone: ExtractionCellTone
  tooltip: string
}

export type ExtractionTableView = {
  page: number
  confidencePercent: string
  confidenceLevel: ExtractedConfidenceLevel
  requiresReview: boolean
  rows: ExtractionTableCellView[][]
}

type ExtractionOverlayKind = 'text' | 'multiline' | 'checkbox'

export type ExtractionOverlayView = {
  id: string
  domId: string
  kind: ExtractionOverlayKind
  label: string
  text: string
  checked: boolean
  className: string
  style: CSSProperties
}

export type ExtractionRebuiltLineView = {
  key: string
  text: string
  style: CSSProperties
}

export type ExtractionPageView = {
  number: number
  imageUrl: string | null
  style: CSSProperties
  overlays: ExtractionOverlayView[]
  lines: ExtractionRebuiltLineView[]
}

export type ExtractionLayoutOption = {
  value: ExtractionLayout
  label: string
  disabled: boolean
  className: string
}

export type ExtractionDocumentView = {
  pages: ExtractionPageView[]
  layoutOptions: ExtractionLayoutOption[]
  showValues: boolean
  showValuesLabel: string
}

export type ExtractionReviewListItem = {
  id: string
  label: string
  summary: string
  icon: string
  iconClassName: string
  className: string
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
  flagged: ExtractionReviewListItem[]
  missing: ExtractionReviewListItem[]
  selected: ExtractionSelectedView | null
}

type ExtractionAnalysis = {
  fileName: string
  data: ExtractionAnalyzeResponse
}

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

function extractionOverlayDomId(id: string): string {
  return `extraction-overlay-${id}`
}

function extractionBoxContainsCenter(outer: ExtractedBox, inner: ExtractedBox): boolean {
  const x = inner.left + inner.width / 2
  const y = inner.top + inner.height / 2
  return x >= outer.left && x <= outer.left + outer.width && y >= outer.top && y <= outer.top + outer.height
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

function extractionBuildItems(data: ExtractionAnalyzeResponse, edits: Record<string, ExtractionEditValue>, confirmed: Record<string, boolean>): ExtractionItem[] {
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

function extractionEstimateEms(text: string): number {
  let ems = 0
  for (const char of text) {
    ems += /[0-9$]/.test(char) ? 0.56 : /[A-Z]/.test(char) ? 0.68 : /[a-z]/.test(char) ? 0.52
      : /[\s.,:;'|!]/.test(char) ? 0.28 : /[-/()]/.test(char) ? 0.33 : /[%@#&]/.test(char) ? 0.85 : 0.56
  }
  return ems
}

function extractionGroupRows(lines: ExtractedLine[]): string[] {
  const rows: { center: number, height: number, lines: ExtractedLine[] }[] = []
  for (const line of [...lines].sort((a, b) => a.box!.top - b.box!.top)) {
    const center = line.box!.top + line.box!.height / 2
    const row = rows.find((candidate) => Math.abs(candidate.center - center) < Math.max(candidate.height, line.box!.height) / 2)
    if (row) row.lines.push(line)
    else rows.push({ center, height: line.box!.height, lines: [line] })
  }
  return rows.map((row) => row.lines.sort((a, b) => a.box!.left - b.box!.left).map((line) => line.text).join(' '))
}

function extractionBuildOverlay(
  item: ExtractionItem,
  box: ExtractedBox,
  aspect: number,
  pageLines: ExtractedLine[],
  lineHeight: number,
  showValues: boolean,
  selectedId: string | null,
): ExtractionOverlayView {
  const printed = item.source.rawValue ?? ''
  const rows = item.origin === 'field' && printed ? extractionGroupRows(pageLines.filter((line) => line.box && extractionBoxContainsCenter(box, line.box))) : []
  const kind: ExtractionOverlayKind = item.kind === 'checkbox' ? 'checkbox' : rows.length > 1 ? 'multiline' : 'text'
  const lineBreaks = kind === 'multiline' && rows.join(' ') === printed
  const text = lineBreaks && !item.edited ? rows.join('\n') : item.text

  // An empty box's region often runs up over its own label; keep the input to the blank space beneath it.
  const labelBottom = item.labelBox && item.labelBox.top < box.top + box.height / 2 ? item.labelBox.top + item.labelBox.height : 0
  const region = !printed && labelBottom > box.top
    ? { ...box, top: labelBottom + lineHeight * 0.3, height: Math.max(lineHeight, box.top + box.height - labelBottom - lineHeight * 0.3) }
    : box
  const target = !printed && kind === 'text' && region.height > lineHeight * 2
    ? { ...region, top: region.top + (region.height - lineHeight * 1.6) / 2, height: lineHeight * 1.6 }
    : region

  // Textract boxes hug the ink, so caps and digits fill ~3/4 of an em while text with descenders fills nearly all of it.
  const inkRatio = /[gjpqy$(),;]/.test(printed) ? 0.92 : 0.74
  const glyphHeight = kind === 'multiline' ? box.height / rows.length * 0.72
    : item.origin === 'cell' || !printed ? lineHeight * 0.95
      : Math.min(box.height, lineHeight * 3) / inkRatio
  const fitWidth = kind === 'text' && printed ? box.width / (extractionEstimateEms(printed) * 1.04) : Infinity
  const fontWidth = Math.min(glyphHeight * aspect, fitWidth)

  const pad = kind === 'checkbox' ? { x: 0.002, y: 0.002 * aspect }
    : item.origin === 'cell' ? { x: -0.004, y: -Math.max(0, (target.height - lineHeight * 1.6) / 2) }
      : { x: 0.004, y: kind === 'multiline' ? 0.004 : target.height * 0.2 }
  const empty = text === '' && item.status !== 'review'
  const tone = !showValues ? EXTRACTION_OVERLAY_PEEK_CLASSES[item.status]
    : kind === 'checkbox' && item.status === 'plain' ? EXTRACTION_OVERLAY_CHECKBOX_CLASS
      : empty && kind !== 'checkbox' ? EXTRACTION_OVERLAY_EMPTY_CLASS
        : EXTRACTION_OVERLAY_TONE_CLASSES[item.status]
  const width = extractionFormatRatio(target.width + pad.x * 2)
  const height = extractionFormatRatio(target.height + pad.y * 2)
  return {
    id: item.id,
    domId: extractionOverlayDomId(item.id),
    kind,
    label: item.label,
    text,
    checked: item.checked,
    className: [EXTRACTION_OVERLAY_BASE_CLASSES[kind], tone, item.id === selectedId ? EXTRACTION_OVERLAY_SELECTED_CLASS : ''].join(' '),
    style: {
      left: extractionFormatRatio(target.left - pad.x),
      top: extractionFormatRatio(target.top - pad.y),
      ...(kind === 'text' ? { minWidth: width, height } : kind === 'multiline' ? { width, minHeight: height } : { width, height }),
      fontSize: `max(6px, ${(fontWidth * 100).toFixed(3)}cqw)`,
    },
  }
}

function extractionMedianLineHeight(lines: ExtractedLine[]): number {
  const heights = lines.flatMap((line) => line.box ? [line.box.height] : []).sort((a, b) => a - b)
  return heights.length === 0 ? EXTRACTION_FALLBACK_TEXT_HEIGHT : heights[Math.floor(heights.length / 2)]!
}

function extractionBuildPages(
  data: ExtractionAnalyzeResponse,
  items: ExtractionItem[],
  previews: DocumentPreviewPage[] | null,
  layout: ExtractionLayout,
  showValues: boolean,
  selectedId: string | null,
): ExtractionPageView[] {
  const pageCount = previews?.length ?? Math.max(1, ...data.fields.map((field) => field.page), ...data.lines.map((line) => line.page))
  return Array.from({ length: pageCount }, (_, index): ExtractionPageView => {
    const number = index + 1
    const preview = previews?.[index] ?? null
    const aspect = preview?.aspect ?? EXTRACTION_FALLBACK_PAGE_ASPECT
    const overlays = items.flatMap((item) => item.page === number && item.box ? [{ item, box: item.box }] : [])
    const overlayBoxes = overlays.map(({ box }) => box)
    const pageLines = data.lines.filter((line) => line.page === number)
    const lineHeight = extractionMedianLineHeight(pageLines)
    return {
      number,
      imageUrl: layout === 'scan' ? preview?.url ?? null : null,
      style: { aspectRatio: `1 / ${aspect}` },
      overlays: overlays.map(({ item, box }) => extractionBuildOverlay(item, box, aspect, pageLines, lineHeight, showValues, selectedId)),
      lines: layout === 'scan' ? [] : data.lines.flatMap((line, lineIndex): ExtractionRebuiltLineView[] => {
        if (line.page !== number || !line.box || overlayBoxes.some((box) => extractionBoxContainsCenter(box, line.box!))) return []
        return [{
          key: `${number}-${lineIndex}`,
          text: line.text,
          style: {
            left: extractionFormatRatio(line.box.left),
            top: extractionFormatRatio(line.box.top),
            fontSize: `max(6px, ${(line.box.height * aspect * 80).toFixed(3)}cqw)`,
          },
        }]
      }),
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
    iconClassName: open ? 'text-review-yellow' : 'text-paragraph-off-white',
    className: item.id === selectedId ? 'bg-card-outlines' : '',
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
    flagged: flagged.map((item) => extractionBuildReviewListItem(
      item,
      selectedId,
      item.status === 'review' ? item.source.issues[0] ?? '' : EXTRACTION_STATUS_LABELS[item.status],
    )),
    missing: items
      .filter((item) => item.box === null && !item.source.requiresReview)
      .map((item) => extractionBuildReviewListItem(item, selectedId, item.edited ? `Filled in: ${item.text}` : 'Not found on the page')),
    selected: selected ? extractionBuildSelected(selected, previews) : null,
  }
}

function extractionBuildFieldRow(item: ExtractionItem): ExtractionFieldRow {
  const { source } = item
  const valueTone: ExtractionValueTone = item.kind === 'checkbox'
    ? (source.value === null && !item.edited ? 'blank' : 'filled')
    : item.edited ? (item.text.trim() ? 'filled' : 'blank')
      : source.rawValue === null ? 'missing' : source.value === null ? 'blank' : 'filled'
  const displayValue = item.kind === 'checkbox'
    ? (valueTone === 'blank' ? 'Unclear' : item.checked ? 'Checked' : 'Unchecked')
    : valueTone === 'missing' ? 'Not found' : valueTone === 'blank' ? 'Blank' : item.text
  return {
    id: item.id,
    label: item.label,
    page: item.page,
    displayValue,
    valueTone,
    normalizedLabel: item.edited ? null : extractionFormatNormalized(source),
    originalLabel: item.edited ? `OCR read: ${source.rawValue || 'nothing'}` : null,
    confidencePercent: extractionFormatPercent(source.confidence),
    confidenceLevel: source.confidenceLevel,
    status: item.status,
    statusLabel: EXTRACTION_STATUS_LABELS[item.status],
    issues: item.status === 'review' ? source.issues : [],
  }
}

function extractionBuildTables(data: ExtractionAnalyzeResponse, itemsById: Map<string, ExtractionItem>): ExtractionTableView[] {
  return data.tables.map((table) => {
    const rows = Array.from({ length: table.rowCount }, () =>
      Array.from({ length: table.columnCount }, (): ExtractionTableCellView => ({ id: '', text: '', normalizedLabel: null, tone: 'plain', tooltip: '' })))
    for (const cell of table.cells) {
      const item = itemsById.get(cell.fieldId ?? cell.id)
      const source = item?.source ?? cell
      rows[cell.row - 1]![cell.column - 1] = {
        id: item?.id ?? cell.id,
        text: item?.text ?? cell.rawValue ?? '',
        normalizedLabel: item && !item.edited ? extractionFormatNormalized(source) : null,
        tone: item ? item.status : cell.role === 'value' ? 'plain' : cell.role,
        tooltip: [`${extractionFormatPercent(source.confidence)} · ${source.confidenceLevel}`, ...source.issues].join('\n'),
      }
    }
    return {
      page: table.page,
      rows,
      confidencePercent: extractionFormatPercent(table.confidence),
      confidenceLevel: table.confidenceLevel,
      requiresReview: table.requiresReview,
    }
  })
}

export function useExtractionUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ExtractionAnalysis | null>(null)
  const [previews, setPreviews] = useState<DocumentPreviewPage[] | null>(null)
  const [edits, setEdits] = useState<Record<string, ExtractionEditValue>>({})
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layout, setLayout] = useState<ExtractionLayout>('scan')
  const [showValues, setShowValues] = useState(true)

  useEffect(() => () => {
    if (previews) documentPreviewRelease(previews)
  }, [previews])

  const result = useMemo(() => {
    if (!analysis) return null
    const { data } = analysis
    const items = extractionBuildItems(data, edits, confirmed)
    const itemsById = new Map(items.map((item) => [item.id, item]))
    const effectiveLayout: ExtractionLayout = previews ? layout : 'rebuilt'
    const review = extractionBuildReview(items, previews, selectedId)
    return {
      fileName: analysis.fileName,
      items,
      review,
      document: {
        pages: extractionBuildPages(data, items, previews, effectiveLayout, showValues, selectedId),
        layoutOptions: (['scan', 'rebuilt'] as const).map((value): ExtractionLayoutOption => ({
          value,
          label: value === 'scan' ? 'Scan' : 'Rebuilt',
          disabled: value === 'scan' && !previews,
          className: value === effectiveLayout ? EXTRACTION_LAYOUT_ACTIVE_CLASS : EXTRACTION_LAYOUT_INACTIVE_CLASS,
        })),
        showValues,
        showValuesLabel: showValues ? 'Hide values' : 'Show values',
      } satisfies ExtractionDocumentView,
      fields: items.filter((item) => item.origin === 'field').map(extractionBuildFieldRow),
      fieldsToReview: items.filter((item) => item.origin === 'field' && item.status === 'review').length,
      tables: extractionBuildTables(data, itemsById),
      lines: data.lines.map((line): ExtractionLineRow => ({
        ...line,
        confidenceLabel: `${extractionFormatPercent(line.confidence)} · ${line.confidenceLevel}`,
        requiresReview: line.confidenceLevel === 'low',
      })),
    }
  }, [analysis, previews, edits, confirmed, selectedId, layout, showValues])

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

    setError(null)
    setAnalysis(null)
    setPreviews(null)
    setUploading(true)
    const [res, pages] = await Promise.all([apiUploadRequest(analyzeApi, undefined, file), documentPreviewRender(file)])
    setUploading(false)

    if (!res.success) {
      if (pages) documentPreviewRelease(pages)
      setError(res.error.message)
      return
    }
    setEdits({})
    setConfirmed({})
    setSelectedId(null)
    setLayout('scan')
    setShowValues(true)
    setPreviews(pages)
    setAnalysis({ fileName: file.name, data: res.data })
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

  function focusItem(id: string) {
    if (!result?.items.some((item) => item.id === id)) return
    setSelectedId(id)
    setShowValues(true)
    requestAnimationFrame(() => {
      const target = document.getElementById(extractionOverlayDomId(id)) ?? document.getElementById(EXTRACTION_EDITOR_DOM_ID)
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target?.focus({ preventScroll: true })
    })
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
    uploading,
    error,
    result,
    upload,
    edit,
    confirm,
    revert,
    select: setSelectedId,
    focusItem,
    focusNext,
    setLayout,
    toggleValues: () => setShowValues((current) => !current),
    accept: EXTRACTION_UPLOAD_MIME_TYPES.join(','),
  }
}
