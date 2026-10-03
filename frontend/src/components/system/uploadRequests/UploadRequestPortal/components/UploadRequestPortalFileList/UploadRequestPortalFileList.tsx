import './.css'
import type { UploadRequestPortalFileView } from '../../.ts'

type UploadRequestPortalFileListProps = {
  files: UploadRequestPortalFileView[]
  onRemove: (id: number) => void
}

const UploadRequestPortalFileList = ({ files, onRemove }: UploadRequestPortalFileListProps) =>
  <ul className="upload-request-portal-file-list flex flex-col rounded-lg" aria-label="Files to send" aria-live="polite">
    {files.map((file) =>
      <li key={file.id} className="upload-request-portal-file-list__item flex items-center gap-3" data-status={file.status}>
        <span className="material-symbols-outlined upload-request-portal-file-list__icon flex-none" aria-hidden="true">{file.icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="upload-request-portal-file-list__name truncate">{file.name}</span>
          <span className="upload-request-portal-file-list__detail">{file.detail}</span>
        </span>
        {file.canRemove &&
          <button type="button" className="upload-request-portal-file-list__remove grid flex-none place-items-center rounded-md" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}>
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>}
      </li>
    )}
  </ul>

export default UploadRequestPortalFileList
