export const DOCUMENT_ERRORS = {
    DOCUMENT_NOT_FOUND:     { STATUS: "NOT_FOUND",   HTTP_CODE: 404, MESSAGE: "Document not found" },
    DOCUMENT_NOT_EXTRACTED: { STATUS: "CONFLICT",    HTTP_CODE: 409, MESSAGE: "This document hasn't finished extracting yet" },
    TAGGING_IN_PROGRESS:    { STATUS: "CONFLICT",    HTTP_CODE: 409, MESSAGE: "This document is already being tagged" },
    REVIEW_FIELD_UNKNOWN:   { STATUS: "BAD_REQUEST", HTTP_CODE: 400, MESSAGE: "The review includes a field this document doesn't have" },
    REVIEW_INCOMPLETE:      { STATUS: "BAD_REQUEST", HTTP_CODE: 400, MESSAGE: "Review every flagged field before confirming" },
    TAGGING_FAILED:         { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "Tagging didn't finish. Try again in a moment" },
} as const;
