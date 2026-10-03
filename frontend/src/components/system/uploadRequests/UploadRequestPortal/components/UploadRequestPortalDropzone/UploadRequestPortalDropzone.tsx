import './.css'
import type { ChangeEvent, DragEvent } from 'react'

type UploadRequestPortalDropzoneProps = {
  accept: string
  hint: string
  dragging: boolean
  disabled: boolean
  onPick: (event: ChangeEvent<HTMLInputElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

const UploadRequestPortalDropzone = ({ accept, hint, dragging, disabled, onPick, onDragOver, onDragLeave, onDrop }: UploadRequestPortalDropzoneProps) =>
  <label
    className="upload-request-portal-dropzone flex flex-col items-center gap-2 rounded-lg text-center"
    data-dragging={dragging}
    aria-disabled={disabled}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
  >
    <span className="material-symbols-outlined upload-request-portal-dropzone__icon" aria-hidden="true">cloud_upload</span>
    <span className="upload-request-portal-dropzone__title">
      Drop files here or <span className="upload-request-portal-dropzone__browse">browse</span>
    </span>
    <span className="upload-request-portal-dropzone__hint">{hint}</span>
    <input type="file" multiple className="sr-only" accept={accept} disabled={disabled} onChange={onPick} />
  </label>

export default UploadRequestPortalDropzone
