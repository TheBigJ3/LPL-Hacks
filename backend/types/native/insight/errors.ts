export const INSIGHT_ERRORS = {
    CONVERSATION_NOT_FOUND: { STATUS: "NOT_FOUND",           HTTP_CODE: 404, MESSAGE: "Conversation not found" },
    CONVERSATION_BUSY:      { STATUS: "CONFLICT",            HTTP_CODE: 409, MESSAGE: "Wait for the current answer to finish before asking again" },
    ANSWER_UNAVAILABLE:     { STATUS: "SERVICE_UNAVAILABLE", HTTP_CODE: 503, MESSAGE: "The assistant is busy right now. Try asking again in a moment" },
    ANSWER_FAILED:          { STATUS: "INTERNAL_ERROR",      HTTP_CODE: 500, MESSAGE: "Something went wrong while answering. Try asking again" },
} as const;
