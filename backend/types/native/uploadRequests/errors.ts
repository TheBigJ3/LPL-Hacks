export const UPLOAD_REQUEST_ERRORS = {
    REQUEST_NOT_FOUND: { STATUS: "NOT_FOUND",      HTTP_CODE: 404, MESSAGE: "This upload link doesn't exist" },
    REQUEST_EXPIRED:   { STATUS: "LINK_EXPIRED",   HTTP_CODE: 410, MESSAGE: "This upload link has expired. Ask your advisor for a new one." },
    REQUEST_REVOKED:   { STATUS: "LINK_REVOKED",   HTTP_CODE: 410, MESSAGE: "This upload link was turned off. Ask your advisor for a new one." },
    REQUEST_SUBMITTED: { STATUS: "LINK_SUBMITTED", HTTP_CODE: 409, MESSAGE: "Files were already sent with this link" },
    REQUEST_FULL:      { STATUS: "LINK_FULL",      HTTP_CODE: 409, MESSAGE: "This upload link can't take any more files" },
    REQUEST_EMPTY:     { STATUS: "LINK_EMPTY",     HTTP_CODE: 400, MESSAGE: "Add at least one file before sending" },
    REQUEST_NOT_OPEN:  { STATUS: "CONFLICT",       HTTP_CODE: 409, MESSAGE: "This request is no longer open" },
} as const;
