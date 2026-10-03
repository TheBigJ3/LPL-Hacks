import './.css'
import { useExtractionUpload } from './.ts'
import ExtractionDocument from './components/ExtractionDocument/ExtractionDocument'
import ExtractionReviewPanel from './components/ExtractionReviewPanel/ExtractionReviewPanel'

const ExtractionUpload = () => {
  const extraction = useExtractionUpload()

  return <div className="extraction-upload flex flex-col items-center">
    <h1 className="sr-only">Extract</h1>

    <label className="extraction-upload__dropzone flex w-full flex-col items-center gap-1 rounded-lg text-center" aria-disabled={extraction.uploading}>
      <span className="material-symbols-outlined extraction-upload__dropzone-icon" aria-hidden="true">document_scanner</span>
      <span className="extraction-upload__dropzone-title">{extraction.uploading ? 'Extracting…' : 'Choose a PDF or image'}</span>
      <span className="extraction-upload__dropzone-hint">Single-page PDF, PNG, JPEG or TIFF, up to 10 MB</span>
      <input type="file" className="sr-only" accept={extraction.accept} disabled={extraction.uploading} onChange={extraction.upload} />
    </label>

    {extraction.error && <p className="extraction-upload__error w-full rounded-lg" role="alert">{extraction.error}</p>}

    {extraction.result && <div className="extraction-upload__content flex w-full flex-col">
      <p className="extraction-upload__summary" aria-live="polite">{extraction.result.summary}</p>
      <div className="extraction-upload__workspace grid items-start">
        <ExtractionDocument document={extraction.result.document} onEdit={extraction.edit} onSelect={extraction.select} onLayout={extraction.setLayout} onToggleValues={extraction.toggleValues} />
        <ExtractionReviewPanel review={extraction.result.review} onEdit={extraction.edit} onConfirm={extraction.confirm} onRevert={extraction.revert} onFocusItem={extraction.focusItem} onNext={extraction.focusNext} />
      </div>
    </div>}
  </div>
}

export default ExtractionUpload
