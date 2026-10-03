export const DOCUMENT_UPLOAD_ERRORS = {
  FILE_TYPE_INVALID: { STATUS: "INVALID_INPUT", MESSAGE: "Upload a PDF, PNG, JPEG or TIFF" },
  FILE_TOO_LARGE:    { STATUS: "INVALID_INPUT", MESSAGE: "Upload a file under 50 MB" },
  IMAGE_TOO_LARGE:   { STATUS: "INVALID_INPUT", MESSAGE: "Upload a PNG or JPEG under 10 MB, or a PDF for larger scans" },
} as const

export type DocumentUploadErrorKey = keyof typeof DOCUMENT_UPLOAD_ERRORS
export type DocumentUploadError = (typeof DOCUMENT_UPLOAD_ERRORS)[DocumentUploadErrorKey]

export const DOCUMENT_LIBRARY_ERRORS = {
  LOAD_FAILED: { STATUS: "LOAD_FAILED", MESSAGE: "Couldn't load this client's documents" },
} as const

export type DocumentLibraryErrorKey = keyof typeof DOCUMENT_LIBRARY_ERRORS
export type DocumentLibraryError = (typeof DOCUMENT_LIBRARY_ERRORS)[DocumentLibraryErrorKey]
