import './.css'
import PageHeader from '@components/template/PageHeader/PageHeader'
import { useExtractionUpload } from './.ts'
import ExtractionDocument from './components/ExtractionDocument/ExtractionDocument'
import ExtractionModePicker from './components/ExtractionModePicker/ExtractionModePicker'
import ExtractionRequest from './components/ExtractionRequest/ExtractionRequest'
import ExtractionReviewPanel from './components/ExtractionReviewPanel/ExtractionReviewPanel'

const ExtractionUpload = () => {
  const extraction = useExtractionUpload()

  return <>
    <PageHeader title="Extract" />
    <div className="extraction-upload flex flex-col items-center">
      <h1 className="sr-only">Extract</h1>

      <ExtractionModePicker options={extraction.modes} onSelect={extraction.selectMode} />

      {extraction.mode === 'request'
        ? <ExtractionRequest client={extraction.client} onReview={extraction.reviewDocument} />
        : <>
          <label className="extraction-upload__dropzone flex w-full flex-col items-center gap-1 rounded-lg text-center" aria-disabled={extraction.busy}>
            <span className="material-symbols-outlined extraction-upload__dropzone-icon" aria-hidden="true">document_scanner</span>
            <span className="extraction-upload__dropzone-title">{extraction.statusLabel}</span>
            <span className="extraction-upload__dropzone-hint">{extraction.hint}</span>
            <input type="file" className="sr-only" accept={extraction.accept} disabled={extraction.busy} onChange={extraction.upload} />
          </label>

          {extraction.error && <p className="extraction-upload__error w-full rounded-lg" role="alert">{extraction.error}</p>}

          {extraction.result && <div className="extraction-upload__content flex w-full flex-col">
            <p className="extraction-upload__summary" aria-live="polite">{extraction.result.summary}</p>
            <div className="extraction-upload__workspace grid items-start">
              <ExtractionDocument document={extraction.result.document} onSelect={extraction.select} />
              <ExtractionReviewPanel review={extraction.result.review} onEdit={extraction.edit} onConfirm={extraction.confirm} onUnconfirm={extraction.unconfirm} onRevert={extraction.revert} onFocusItem={extraction.focusItem} onNext={extraction.focusNext} onConfirmExport={extraction.confirmExport} />
            </div>
          </div>}
        </>}
    </div>
  </>
}

export default ExtractionUpload
