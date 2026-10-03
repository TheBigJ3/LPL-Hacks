import './.css'
import type { ExtractionProgressView } from '../../.ts'

const ExtractionProgress = ({ progress, onCancel }: {
  progress: ExtractionProgressView
  onCancel: () => void
}) =>
  <section className="extraction-progress flex w-full flex-col gap-5 rounded-lg" aria-label="Extraction progress" aria-live="polite">
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined extraction-progress__file-icon grid flex-none place-items-center rounded-md" aria-hidden="true">description</span>
      <div className="flex min-w-0 flex-col">
        <h2 className="extraction-progress__title">Reading your document…</h2>
        <p className="extraction-progress__file truncate">{progress.fileName}</p>
      </div>
    </div>

    <ol className="flex flex-col">
      {progress.steps.map((step) =>
        <li key={step.number} className="extraction-progress__step flex gap-3" data-state={step.state} aria-current={step.state === 'active' ? 'step' : undefined}>
          <span className="extraction-progress__marker grid flex-none place-items-center rounded-full" aria-hidden="true">
            {step.state === 'done'
              ? <span className="material-symbols-outlined">check</span>
              : step.state === 'active'
                ? <span className="extraction-progress__spinner rounded-full" />
                : step.number}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5 pb-5">
            <p className="extraction-progress__label">{step.label}</p>
            <p className="extraction-progress__hint">{step.hint}</p>
          </div>
        </li>
      )}
    </ol>

    <div className="flex justify-end">
      <button type="button" className="extraction-progress__cancel rounded-md" onClick={onCancel}>Cancel</button>
    </div>
  </section>

export default ExtractionProgress
