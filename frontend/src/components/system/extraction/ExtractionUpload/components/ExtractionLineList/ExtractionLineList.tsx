import type { ExtractionLineRow } from '@components/system/extraction/ExtractionUpload/.ts'

export default function ExtractionLineList({ lines }: { lines: ExtractionLineRow[] }) {
  return <section className="flex flex-col gap-2">
    <h5 className="font-bold text-main-white">All text</h5>
    <ol className="flex flex-col gap-1 rounded-xl border border-card-outlines bg-card-bg p-4 text-sm">
      {lines.map((line, index) => <li key={index} title={`Page ${line.page} · ${line.confidenceLabel}`} className={line.requiresReview ? 'text-review-yellow' : 'text-paragraph-off-white'}>{line.text}</li>)}
    </ol>
  </section>
}
