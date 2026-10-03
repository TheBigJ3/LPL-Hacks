import './.css'
import type { ExtractionConfirmView, ExtractionToolbarView } from '../../.ts'

const ExtractionToolbar = ({ toolbar, confirm, onBack, onConfirm }: {
  toolbar: ExtractionToolbarView
  confirm: ExtractionConfirmView
  onBack: () => void
  onConfirm: () => void
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

    <button type="button" className="extraction-toolbar__confirm flex flex-none items-center gap-1.5 rounded-md" data-ready={!confirm.disabled} disabled={confirm.disabled} title={confirm.hint ?? undefined} onClick={onConfirm}>
      <span className="material-symbols-outlined" data-icon={confirm.icon} aria-hidden="true">{confirm.icon}</span>
      {confirm.label}
    </button>
  </div>

export default ExtractionToolbar
