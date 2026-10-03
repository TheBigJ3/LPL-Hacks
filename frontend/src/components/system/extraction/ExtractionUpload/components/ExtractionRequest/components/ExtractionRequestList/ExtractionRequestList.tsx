import './.css'
import { UPLOAD_REQUEST_ERRORS } from '@typings/native/uploadRequests/errors'
import type { ExtractionRequestView } from '../../.ts'

type ExtractionRequestListProps = {
  requests: ExtractionRequestView[]
  loading: boolean
  loadFailed: boolean
  onCopy: (request: ExtractionRequestView) => void
  onRevoke: (uploadRequestId: string) => void
  onReview: (documentId: string) => void
}

const ExtractionRequestList = ({ requests, loading, loadFailed, onCopy, onRevoke, onReview }: ExtractionRequestListProps) =>
  <section className="extraction-request-list flex flex-col gap-3" aria-label="Upload links">
    <h3 className="extraction-request-list__heading">Upload links</h3>

    {loading && <p className="extraction-request-list__empty rounded-lg">Loading links…</p>}
    {loadFailed && <p className="extraction-request-list__empty rounded-lg" role="alert">{UPLOAD_REQUEST_ERRORS.LIST_LOAD_FAILED.MESSAGE}</p>}
    {!loading && !loadFailed && requests.length === 0 &&
      <p className="extraction-request-list__empty rounded-lg">No links yet. Create one above and send it to your client.</p>}

    {requests.length > 0 && <ul className="flex flex-col gap-3">
      {requests.map((request) =>
        <li key={request.id} className="extraction-request-list__item flex flex-col rounded-lg" data-state={request.state} data-fresh={request.fresh}>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined extraction-request-list__state-icon grid flex-none place-items-center rounded-md" aria-hidden="true">{request.stateIcon}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="extraction-request-list__state">{request.stateLabel}</p>
              <p className="extraction-request-list__meta">{request.meta}</p>
              {request.note && <p className="extraction-request-list__note">“{request.note}”</p>}
            </div>
            {request.canRevoke &&
              <button type="button" className="extraction-request-list__revoke flex-none rounded-md" onClick={() => onRevoke(request.id)}>Turn off</button>}
          </div>

          {request.canCopy && <div className="extraction-request-list__link flex items-center gap-2 rounded-lg">
            <span className="material-symbols-outlined extraction-request-list__link-icon flex-none" aria-hidden="true">link</span>
            <input
              className="extraction-request-list__link-input min-w-0 flex-1"
              readOnly
              value={request.link}
              aria-label="Upload link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className="extraction-request-list__copy flex flex-none items-center gap-1.5 rounded-md" data-copied={request.copied} onClick={() => onCopy(request)}>
              <span className="material-symbols-outlined" aria-hidden="true">{request.copied ? 'check' : 'content_copy'}</span>
              {request.copied ? 'Copied' : 'Copy link'}
            </button>
          </div>}

          {request.documents.length > 0 && <ul className="extraction-request-list__documents flex flex-col">
            {request.documents.map((document) =>
              <li key={document.id} className="extraction-request-list__document flex items-center gap-3">
                <span className="material-symbols-outlined extraction-request-list__document-icon flex-none" aria-hidden="true">description</span>
                <span className="extraction-request-list__file min-w-0 flex-1 truncate">{document.fileName}</span>
                <span className="extraction-request-list__document-status flex-none" data-status={document.status}>{document.statusLabel}</span>
                {document.canReview &&
                  <button type="button" className="extraction-request-list__review flex flex-none items-center gap-1 rounded-md" onClick={() => onReview(document.id)}>
                    Review
                    <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                  </button>}
              </li>
            )}
          </ul>}
        </li>
      )}
    </ul>}
  </section>

export default ExtractionRequestList
