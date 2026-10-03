import './.css'
import type { ExtractionToolbarView } from '../../.ts'

const ExtractionToolbar = ({ toolbar, onBack, onDownload }: {
  toolbar: ExtractionToolbarView
  onBack: () => void
  onDownload: () => void
}) =>
  <div className="extraction-toolbar flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg">
    <button type="button" className="extraction-toolbar__back flex flex-none items-center gap-1.5 rounded-md" onClick={onBack}>
      <span className="material-symbols-outlined" aria-hidden="true">{toolbar.backIcon}</span>
      {toolbar.backLabel}
    </button>

    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="material-symbols-outlined extraction-toolbar__file-icon grid flex-none place-items-center rounded-md" aria-hidden="true">description</span>
      <div className="flex min-w-0 flex-col">
        <p className="extraction-toolbar__name truncate">{toolbar.fileName}</p>
        <p className="extraction-toolbar__meta truncate">{toolbar.meta}</p>
      </div>
    </div>

    <div className="extraction-toolbar__progress flex flex-none items-center gap-2.5" data-complete={toolbar.complete} aria-live="polite">
      <div className="extraction-toolbar__track h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <div style={toolbar.progressStyle} className="extraction-toolbar__bar h-full rounded-full" />
      </div>
      <span className="extraction-toolbar__count">{toolbar.progressLabel}</span>
    </div>

    <button type="button" className="extraction-toolbar__download flex flex-none items-center gap-1.5 rounded-md" data-ready={toolbar.complete} onClick={onDownload}>
      <span className="material-symbols-outlined" aria-hidden="true">download</span>
      Download JSON
    </button>
  </div>

export default ExtractionToolbar
