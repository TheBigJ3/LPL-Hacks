export const EXTRACTION_ERRORS = {
  FILE_TYPE_INVALID: { STATUS: "INVALID_INPUT", MESSAGE: "Upload a PDF, PNG, JPEG or TIFF" },
  FILE_TOO_LARGE:    { STATUS: "INVALID_INPUT", MESSAGE: "Upload a file under 50 MB" },
  IMAGE_TOO_LARGE:   { STATUS: "INVALID_INPUT", MESSAGE: "Upload a PNG or JPEG under 10 MB, or a PDF for larger scans" },
  WAIT_TIMED_OUT:    { STATUS: "TIMEOUT",       MESSAGE: "Extraction is taking longer than expected. Try again in a few minutes" },
} as const

export type ExtractionErrorKey = keyof typeof EXTRACTION_ERRORS
export type ExtractionError = (typeof EXTRACTION_ERRORS)[ExtractionErrorKey]
