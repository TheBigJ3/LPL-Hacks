import './.css'
import PageHeader from '@components/template/PageHeader/PageHeader'
import { useExtractionUpload } from './.ts'
import ExtractionDocument from './components/ExtractionDocument/ExtractionDocument'
import ExtractionModePicker from './components/ExtractionModePicker/ExtractionModePicker'
import ExtractionProgress from './components/ExtractionProgress/ExtractionProgress'
import ExtractionRequest from './components/ExtractionRequest/ExtractionRequest'
import ExtractionReviewPanel from './components/ExtractionReviewPanel/ExtractionReviewPanel'
import ExtractionToolbar from './components/ExtractionToolbar/ExtractionToolbar'

const ExtractionUpload = () => {
  const extraction = useExtractionUpload()

  return <>
    <PageHeader title="Extract" />
    {extraction.result
      ? <div className="extraction-upload flex flex-col" data-reviewing="true">
        <h1 className="sr-only">Review {extraction.result.toolbar.fileName}</h1>
        <ExtractionToolbar toolbar={extraction.result.toolbar} onBack={extraction.startOver} onDownload={extraction.download} />
        <div className="extraction-upload__workspace grid">
          <ExtractionDocument document={extraction.result.document} onSelect={extraction.pickHighlight} />
          <ExtractionReviewPanel
            review={extraction.result.review}
            onView={extraction.showView}
            onPick={extraction.pickField}
            onPrev={extraction.prev}
            onNext={extraction.next}
            onSkip={extraction.skip}
            onChange={extraction.changeValue}
            onSubmit={extraction.submit}
            onUndo={extraction.undo}
            onDownload={extraction.download}
          />
        </div>
      </div>
      : <div className="extraction-upload flex flex-col items-center" data-reviewing="false">
        <h1 className="sr-only">Extract</h1>

        {!extraction.progress && <ExtractionModePicker options={extraction.modes} onSelect={extraction.selectMode} />}

        {extraction.mode === 'request'
          ? <ExtractionRequest client={extraction.client} onReview={extraction.reviewDocument} />
          : <>
            {extraction.progress
              ? <ExtractionProgress progress={extraction.progress} onCancel={extraction.startOver} />
              : <label className="extraction-upload__dropzone flex w-full flex-col items-center gap-1 rounded-lg text-center">
                <span className="material-symbols-outlined extraction-upload__dropzone-icon" aria-hidden="true">document_scanner</span>
                <span className="extraction-upload__dropzone-title">Choose a PDF or image</span>
                <span className="extraction-upload__dropzone-hint">{extraction.hint}</span>
                <input type="file" className="sr-only" accept={extraction.accept} onChange={extraction.upload} />
              </label>}

            {extraction.error && <p className="extraction-upload__error w-full rounded-lg" role="alert">{extraction.error}</p>}
          </>}
      </div>}
  </>
}

export default ExtractionUpload
