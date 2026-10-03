export const CLIENT_ERRORS = {
    CLIENT_NOT_FOUND:      { STATUS: "NOT_FOUND", HTTP_CODE: 404, MESSAGE: "Client not found" },
    CLIENT_NAME_CONFLICT:  { STATUS: "CONFLICT",  HTTP_CODE: 409, MESSAGE: "Another client with that name was just added, try again" },
} as const;
