export const OPENDECISION_ERRORS = {
    REQUEST_TOO_LARGE:  { STATUS: "PAYLOAD_TOO_LARGE",   HTTP_CODE: 413, MESSAGE: "Too much data to analyze in one request" },
    ANALYSIS_BUSY:      { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "Analysis is unavailable, try again shortly" },
} as const;
