import {
  EXTRACTION_CONFIDENCE_DOT_CLASSES,
  EXTRACTION_CONFIDENCE_PILL_CLASSES,
  EXTRACTION_ROW_STATUS_CLASSES,
  EXTRACTION_STATUS_BADGE_CLASSES,
  EXTRACTION_VALUE_TONE_CLASSES,
  type ExtractionFieldRow,
} from '@components/system/extraction/ExtractionUpload/.ts'

export default function ExtractionFieldTable({ fields, fieldsToReview, onSelect }: {
  fields: ExtractionFieldRow[]
  fieldsToReview: number
  onSelect: (id: string) => void
}) {
  return <section className="flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-4">
      <h5 className="font-bold text-main-white">Fields</h5>
      <p className="text-sm text-placeholder-gray">
        {fields.length} found · <span className={fieldsToReview > 0 ? 'text-review-yellow' : ''}>{fieldsToReview} to review</span>
      </p>
    </div>
    <div className="overflow-x-auto rounded-xl border border-card-outlines bg-card-bg">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-card-outlines bg-card-outlines-faint text-xs uppercase tracking-wider text-placeholder-gray">
            <th className="px-4 py-3 font-normal">Label</th>
            <th className="px-4 py-3 font-normal">Value</th>
            <th className="px-4 py-3 font-normal">Confidence</th>
            <th className="px-4 py-3 font-normal">Page</th>
            <th className="px-4 py-3 font-normal">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-outlines">
          {fields.map((field) => <tr key={field.id} onClick={() => onSelect(field.id)} className={`cursor-pointer align-top transition-colors hover:bg-card-outlines-faint ${EXTRACTION_ROW_STATUS_CLASSES[field.status]}`}>
            <td className="w-1/4 px-4 py-3 text-paragraph-off-white">{field.label}</td>
            <td className="px-4 py-3">
              <span className={EXTRACTION_VALUE_TONE_CLASSES[field.valueTone]}>{field.displayValue}</span>
              {field.normalizedLabel && <span className="mt-1.5 block w-fit rounded-md bg-card-outlines px-1.5 py-0.5 font-mono text-xs text-paragraph-off-white">{field.normalizedLabel}</span>}
              {field.originalLabel && <span className="mt-1.5 block text-xs text-placeholder-gray line-through decoration-placeholder-gray/60">{field.originalLabel}</span>}
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              <span title={field.confidenceLevel} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs tabular-nums ${EXTRACTION_CONFIDENCE_PILL_CLASSES[field.confidenceLevel]}`}>
                <span className={`size-1.5 rounded-full ${EXTRACTION_CONFIDENCE_DOT_CLASSES[field.confidenceLevel]}`} />
                {field.confidencePercent}
              </span>
            </td>
            <td className="px-4 py-3 text-placeholder-gray tabular-nums">{field.page}</td>
            <td className="w-1/3 px-4 py-3">
              {field.issues.length > 0
                ? <ul className="flex flex-col gap-1 text-xs text-review-yellow">
                  {field.issues.map((issue, issueIndex) => <li key={issueIndex} className="flex gap-1.5">
                    <span className="material-symbols-outlined pt-px text-sm">error</span>
                    {issue}
                  </li>)}
                </ul>
                : <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${EXTRACTION_STATUS_BADGE_CLASSES[field.status]}`}>{field.statusLabel}</span>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>
}
