export const EXTRACTION_ERRORS = {
    DOCUMENT_UNREADABLE:  { STATUS: "UNPROCESSABLE_ENTITY", HTTP_CODE: 422, MESSAGE: "The document couldn't be read. Upload a clear PDF or image" },
    DOCUMENT_TOO_LARGE:   { STATUS: "PAYLOAD_TOO_LARGE",    HTTP_CODE: 413, MESSAGE: "The document is too large to analyze" },
    EXTRACTION_BUSY:      { STATUS: "SERVICE_UNAVAILABLE",  HTTP_CODE: 503, MESSAGE: "Extraction is busy, try again shortly" },
} as const;
