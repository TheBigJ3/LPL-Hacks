import {
  EXTRACTION_CELL_TONE_CLASSES,
  EXTRACTION_CONFIDENCE_DOT_CLASSES,
  EXTRACTION_CONFIDENCE_PILL_CLASSES,
  type ExtractionTableView,
} from '@components/system/extraction/ExtractionUpload/.ts'

export default function ExtractionTableGrid({ table, index, onSelect }: { table: ExtractionTableView, index: number, onSelect: (id: string) => void }) {
  return <section className="flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-4">
      <h5 className="font-bold text-main-white">Table {index + 1}</h5>
      <div className="flex items-center gap-2 text-sm text-placeholder-gray">
        <span>Page {table.page}</span>
        <span title={table.confidenceLevel} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs tabular-nums ${EXTRACTION_CONFIDENCE_PILL_CLASSES[table.confidenceLevel]}`}>
          <span className={`size-1.5 rounded-full ${EXTRACTION_CONFIDENCE_DOT_CLASSES[table.confidenceLevel]}`} />
          {table.confidencePercent}
        </span>
      </div>
    </div>
    <div className={`overflow-x-auto rounded-xl border bg-card-bg ${table.requiresReview ? 'border-review-yellow/60' : 'border-card-outlines'}`}>
      <table className="w-full border-collapse text-left text-sm">
        <tbody className="divide-y divide-card-outlines">
          {table.rows.map((row, rowIndex) => <tr key={rowIndex} className="divide-x divide-card-outlines transition-colors hover:bg-card-outlines-faint">
            {row.map((cell, columnIndex) => <td key={columnIndex} title={cell.tooltip} onClick={() => onSelect(cell.id)} className={`cursor-pointer px-4 py-2.5 align-top tabular-nums ${EXTRACTION_CELL_TONE_CLASSES[cell.tone]}`}>
              {cell.text}
              {cell.normalizedLabel && <span className="mt-1 block w-fit rounded-md bg-card-outlines px-1.5 py-0.5 font-mono text-xs text-paragraph-off-white">{cell.normalizedLabel}</span>}
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>
}
