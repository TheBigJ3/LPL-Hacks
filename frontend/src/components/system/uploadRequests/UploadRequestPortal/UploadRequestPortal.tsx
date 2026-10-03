import './.css'
import { UPLOAD_REQUEST_PORTAL_STEPS, useUploadRequestPortal } from './.ts'
import UploadRequestPortalDropzone from './components/UploadRequestPortalDropzone/UploadRequestPortalDropzone'
import UploadRequestPortalFileList from './components/UploadRequestPortalFileList/UploadRequestPortalFileList'
import UploadRequestPortalNotice from './components/UploadRequestPortalNotice/UploadRequestPortalNotice'

const UploadRequestPortal = () => {
  const portal = useUploadRequestPortal()

  return <div className="upload-request-portal flex min-h-dvh w-full justify-center bg-main-white">
    <main className="upload-request-portal__card flex w-full flex-col rounded-xl" aria-busy={portal.loading}>
      {portal.loading && <div className="upload-request-portal__loading flex flex-col gap-3" aria-label="Loading">
        <span className="upload-request-portal__skeleton h-4 w-1/3 rounded-sm" />
        <span className="upload-request-portal__skeleton h-8 w-2/3 rounded-sm" />
        <span className="upload-request-portal__skeleton h-40 w-full rounded-lg" />
      </div>}

      {portal.notice && <UploadRequestPortalNotice notice={portal.notice} />}

      {portal.portal && !portal.notice && <>
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="material-symbols-outlined upload-request-portal__badge grid place-items-center rounded-full" aria-hidden="true">folder_shared</span>
          <p className="upload-request-portal__eyebrow">{portal.portal.clientName}</p>
          <h1 className="upload-request-portal__title">Send your documents</h1>
          <p className="upload-request-portal__lede">{portal.portal.requestedBy} asked you to upload documents. Everything you send goes straight to them.</p>
        </header>

        {portal.portal.note && <figure className="upload-request-portal__note flex flex-col gap-1 rounded-lg">
          <figcaption className="upload-request-portal__note-label">Note from {portal.portal.requestedBy}</figcaption>
          <blockquote className="upload-request-portal__note-text">{portal.portal.note}</blockquote>
        </figure>}

        <ol className="upload-request-portal__steps grid" aria-label="How it works">
          {UPLOAD_REQUEST_PORTAL_STEPS.map((step) =>
            <li key={step.number} className="flex items-center gap-2">
              <span className="upload-request-portal__step-number grid flex-none place-items-center rounded-full">{step.number}</span>
              {step.label}
            </li>
          )}
        </ol>

        <UploadRequestPortalDropzone
          accept={portal.accept}
          hint={portal.hint}
          dragging={portal.dragging}
          disabled={portal.sending}
          onPick={portal.pick}
          onDragOver={portal.dragOver}
          onDragLeave={portal.dragLeave}
          onDrop={portal.drop}
        />

        {portal.files.length > 0 && <UploadRequestPortalFileList files={portal.files} onRemove={portal.remove} />}

        {portal.error && <p className="upload-request-portal__error rounded-lg" role="alert">{portal.error}</p>}

        <button type="button" className="upload-request-portal__send flex w-full items-center justify-center gap-2 rounded-lg" disabled={!portal.canSend} onClick={portal.send}>
          <span className="material-symbols-outlined" aria-hidden="true">send</span>
          {portal.sendLabel}
        </button>

        <p className="upload-request-portal__footer flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined" aria-hidden="true">lock</span>
          {portal.footer}
        </p>
      </>}
    </main>
  </div>
}

export default UploadRequestPortal
