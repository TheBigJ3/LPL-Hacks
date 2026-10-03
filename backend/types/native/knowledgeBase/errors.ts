export const KNOWLEDGE_BASE_ERRORS = {
    DECISION_NOT_JSON: { STATUS: "UNPROCESSABLE_ENTITY", HTTP_CODE: 422, MESSAGE: "The decision file is not valid JSON" },
    DECISION_INVALID:  { STATUS: "UNPROCESSABLE_ENTITY", HTTP_CODE: 422, MESSAGE: "The decision file does not have the expected answers shape" },
    DECISION_EMPTY:    { STATUS: "UNPROCESSABLE_ENTITY", HTTP_CODE: 422, MESSAGE: "The decision file has no evidence text to index" },
} as const;
