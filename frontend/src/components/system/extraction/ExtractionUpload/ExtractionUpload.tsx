import { useExtractionUpload } from './.ts'
import ExtractionDocument from './components/ExtractionDocument/ExtractionDocument'
import ExtractionReviewPanel from './components/ExtractionReviewPanel/ExtractionReviewPanel'
import ExtractionFieldTable from './components/ExtractionFieldTable/ExtractionFieldTable'
import ExtractionTableGrid from './components/ExtractionTableGrid/ExtractionTableGrid'
import ExtractionLineList from './components/ExtractionLineList/ExtractionLineList'

export default function ExtractionUpload() {
  const extraction = useExtractionUpload()

  return <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10">
    <h4 className="font-bold text-main-white">Analyze a document</h4>

    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-card-outlines bg-card-bg px-6 py-10 text-center hover:border-main-pink" aria-disabled={extraction.uploading}>
      <span className="text-main-white">{extraction.uploading ? 'Extracting…' : 'Choose a PDF or image'}</span>
      <span className="text-sm text-placeholder-gray">Single-page PDF, PNG, JPEG or TIFF, up to 10 MB</span>
      <input type="file" className="hidden" accept={extraction.accept} disabled={extraction.uploading} onChange={extraction.upload} />
    </label>

    {extraction.error && <p className="rounded-lg border border-error-outline bg-error-red/30 px-4 py-3 text-main-white">{extraction.error}</p>}

    {extraction.result && <>
      <p className="text-paragraph-off-white">{extraction.result.fileName} · {extraction.result.fields.length} fields · {extraction.result.tables.length} tables · {extraction.result.lines.length} lines</p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ExtractionDocument document={extraction.result.document} onEdit={extraction.edit} onSelect={extraction.select} onLayout={extraction.setLayout} onToggleValues={extraction.toggleValues} />
        <ExtractionReviewPanel review={extraction.result.review} onEdit={extraction.edit} onConfirm={extraction.confirm} onRevert={extraction.revert} onFocusItem={extraction.focusItem} onNext={extraction.focusNext} />
      </div>
      <ExtractionFieldTable fields={extraction.result.fields} fieldsToReview={extraction.result.fieldsToReview} onSelect={extraction.focusItem} />
      {extraction.result.tables.map((table, index) => <ExtractionTableGrid key={index} table={table} index={index} onSelect={extraction.focusItem} />)}
      <ExtractionLineList lines={extraction.result.lines} />
    </>}
  </main>
}
