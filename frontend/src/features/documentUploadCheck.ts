import { DOCUMENT_UPLOAD_ERRORS, type DocumentUploadError } from '@typings/native/documents/errors'

const DOCUMENT_UPLOAD_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff']
const DOCUMENT_UPLOAD_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/tiff']
const DOCUMENT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024
const DOCUMENT_UPLOAD_IMAGE_MAX_BYTES = 10 * 1024 * 1024

export const DOCUMENT_UPLOAD_ACCEPT = DOCUMENT_UPLOAD_MIME_TYPES.join(',')

export const DOCUMENT_UPLOAD_HINT = 'Multi-page PDF or TIFF up to 50 MB, PNG or JPEG up to 10 MB'

export function documentUploadCheckFile(file: File): DocumentUploadError | null {
  if (!DOCUMENT_UPLOAD_MIME_TYPES.includes(file.type)) return DOCUMENT_UPLOAD_ERRORS.FILE_TYPE_INVALID
  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) return DOCUMENT_UPLOAD_ERRORS.FILE_TOO_LARGE
  if (DOCUMENT_UPLOAD_IMAGE_MIME_TYPES.includes(file.type) && file.size > DOCUMENT_UPLOAD_IMAGE_MAX_BYTES) return DOCUMENT_UPLOAD_ERRORS.IMAGE_TOO_LARGE
  return null
}
