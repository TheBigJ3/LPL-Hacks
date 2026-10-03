export const NOTE_ERRORS = {
    NOTE_NOT_FOUND:   { STATUS: "NOT_FOUND",   HTTP_CODE: 404, MESSAGE: "Note not found" },
    MEMBER_NOT_FOUND: { STATUS: "BAD_REQUEST", HTTP_CODE: 400, MESSAGE: "That person isn't part of this client" },
} as const;
