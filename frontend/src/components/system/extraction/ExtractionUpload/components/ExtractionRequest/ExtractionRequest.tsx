import './.css'
import type { Client } from '@lpl-hacks/shared/src/types/native/clients/client'
import EmptyState from '@components/template/EmptyState/EmptyState'
import { useExtractionRequest } from './.ts'
import ExtractionRequestList from './components/ExtractionRequestList/ExtractionRequestList'

type ExtractionRequestProps = {
  client: Client | null
  onReview: (documentId: string) => void
}

const ExtractionRequest = ({ client, onReview }: ExtractionRequestProps) => {
  const request = useExtractionRequest(client)

  if (!client) return <div className="extraction-request extraction-request--empty flex w-full justify-center">
    <EmptyState title="Pick a client first" subtitle="Upload links belong to one client. Choose one in the sidebar to request their documents." />
  </div>

  return <section className="extraction-request flex w-full flex-col" aria-label="Request documents">
    <form className="extraction-request__composer flex flex-col rounded-lg" onSubmit={request.create}>
      <div className="flex flex-col gap-1">
        <h2 className="extraction-request__title">Request documents from {client.name}</h2>
        <p className="extraction-request__lede">They get a private link to upload one set of files. The link closes as soon as they send them.</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="extraction-request__label">Note for your client <span className="extraction-request__optional">(optional)</span></span>
        <textarea
          className="extraction-request__note rounded-lg"
          rows={3}
          maxLength={request.noteMax}
          placeholder="e.g. Please upload your 2024 W-2s and any 1099s"
          value={request.note}
          onChange={(event) => request.setNote(event.target.value)}
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="extraction-request__label">Link expires after</legend>
        <div className="flex flex-wrap gap-2">
          {request.expiryOptions.map((option) =>
            <label key={option.days} className="extraction-request__chip flex items-center rounded-full" data-selected={option.selected}>
              <input type="radio" name="extraction-request-expiry" className="sr-only" checked={option.selected} onChange={() => request.setExpiresInDays(option.days)} />
              {option.label}
            </label>
          )}
        </div>
      </fieldset>

      {request.error && <p className="extraction-request__error rounded-lg" role="alert">{request.error}</p>}

      <div className="flex justify-end">
        <button type="submit" className="extraction-request__create flex items-center gap-2 rounded-lg" disabled={request.creating}>
          <span className="material-symbols-outlined" aria-hidden="true">add_link</span>
          {request.createLabel}
        </button>
      </div>
    </form>

    <ExtractionRequestList
      requests={request.requests}
      loading={request.loading}
      loadFailed={request.loadFailed}
      onCopy={request.copy}
      onRevoke={request.revoke}
      onReview={onReview}
    />
  </section>
}

export default ExtractionRequest
