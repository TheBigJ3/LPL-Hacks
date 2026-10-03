export const CLIENT_ERRORS = {
  LOAD_FAILED:         { STATUS: "LOAD_FAILED", MESSAGE: "Couldn't load your clients" },
  NAME_REQUIRED:       { STATUS: "INVALID_INPUT", MESSAGE: "Give the household a name" },
  FULL_NAME_REQUIRED:  { STATUS: "INVALID_INPUT", MESSAGE: "Enter a first and last name, as it appears on their documents" },
  MEMBER_REQUIRED:     { STATUS: "INVALID_INPUT", MESSAGE: "Add at least one person to the household" },
} as const

export type ClientErrorKey = keyof typeof CLIENT_ERRORS
export type ClientError = (typeof CLIENT_ERRORS)[ClientErrorKey]
