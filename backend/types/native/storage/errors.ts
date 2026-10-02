export const STORAGE_ERRORS = {
    OBJECT_NOT_FOUND:  { STATUS: "NOT_FOUND",           HTTP_CODE: 404, MESSAGE: "File not found" },
    UPLOAD_FAILED:     { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "Unable to upload file, try again later" },
    DOWNLOAD_FAILED:   { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "Unable to read file, try again later" },
    DELETE_FAILED:     { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "Unable to delete file, try again later" },
    LIST_FAILED:       { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "Unable to list files, try again later" },
    SIGNED_URL_FAILED: { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "Unable to prepare file access, try again later" },
    BUCKET_NOT_PUBLIC: { STATUS: "FORBIDDEN",           HTTP_CODE: 403, MESSAGE: "File is not publicly accessible" },
} as const;
