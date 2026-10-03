export const EXTRACTION_ERRORS = {
  WAIT_TIMED_OUT:    { STATUS: "TIMEOUT",       MESSAGE: "Extraction is taking longer than expected. Try again in a few minutes" },
  TAG_WAIT_TIMED_OUT:  { STATUS: "TIMEOUT",     MESSAGE: "Tagging is taking longer than expected. Check back in a few minutes" },
  PREVIEW_UNAVAILABLE: { STATUS: "UNSUPPORTED", MESSAGE: "This browser can't display this file, so the original page can't be shown. Review what was picked up in the Review panel" },
} as const

export type ExtractionErrorKey = keyof typeof EXTRACTION_ERRORS
export type ExtractionError = (typeof EXTRACTION_ERRORS)[ExtractionErrorKey]
