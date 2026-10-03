export const EXTRACTION_ERRORS = {
  FILE_TYPE_INVALID: { STATUS: "INVALID_INPUT", MESSAGE: "Upload a PDF, PNG, JPEG or TIFF" },
  FILE_TOO_LARGE:    { STATUS: "INVALID_INPUT", MESSAGE: "Upload a file under 10 MB" },
} as const

export type ExtractionErrorKey = keyof typeof EXTRACTION_ERRORS
export type ExtractionError = (typeof EXTRACTION_ERRORS)[ExtractionErrorKey]
