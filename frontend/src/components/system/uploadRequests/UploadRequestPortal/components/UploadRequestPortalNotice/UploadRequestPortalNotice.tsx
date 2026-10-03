import './.css'
import type { UploadRequestPortalNoticeView } from '../../.ts'

const UploadRequestPortalNotice = ({ notice }: { notice: UploadRequestPortalNoticeView }) =>
  <section className="upload-request-portal-notice flex flex-col items-center gap-3 text-center" data-tone={notice.tone} role="status">
    <span className="material-symbols-outlined upload-request-portal-notice__icon grid place-items-center rounded-full" aria-hidden="true">{notice.icon}</span>
    <h1 className="upload-request-portal-notice__title">{notice.title}</h1>
    <p className="upload-request-portal-notice__message">{notice.message}</p>
  </section>

export default UploadRequestPortalNotice
