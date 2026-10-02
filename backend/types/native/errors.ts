
export type ERROR_TYPE = {
    STATUS? : String,
    HTTP_CODE : number,
    MESSAGE : string
}

export const GENERAL_ERRORS = {
    LOCK_ACQUISITION_FAILED: { STATUS: "CONFLICT", HTTP_CODE: 409, MESSAGE: "Resource is locked, try again later" },
    LOCK_RELEASE_FAILED: { STATUS: "CONFLICT", HTTP_CODE: 409, MESSAGE: "Lock was not held or already released" },

    BAD_REQUEST:       { STATUS: "BAD_REQUEST",       HTTP_CODE: 400, MESSAGE: "Bad Request" },
    NOT_FOUND:         { STATUS: "NOT_FOUND",         HTTP_CODE: 404, MESSAGE: "Not found" },
    TOO_MANY_REQUESTS: { STATUS: "TOO_MANY_REQUESTS", HTTP_CODE: 429, MESSAGE: "Too Many Requests" },

    UPLOAD_LENGTH_REQUIRED: { STATUS: "LENGTH_REQUIRED",       HTTP_CODE: 411, MESSAGE: "Upload size must be declared" },
    UPLOAD_TYPE_INVALID:    { STATUS: "UNSUPPORTED_MEDIA_TYPE", HTTP_CODE: 415, MESSAGE: "Unsupported file type" },
    UPLOAD_TOO_LARGE:       { STATUS: "PAYLOAD_TOO_LARGE",      HTTP_CODE: 413, MESSAGE: "File is too large" },
} as const;
