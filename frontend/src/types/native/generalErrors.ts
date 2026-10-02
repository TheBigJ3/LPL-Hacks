export const GENERAL_ERRORS = {
  NETWORK_UNREACHABLE: { STATUS: "NETWORK_UNREACHABLE", MESSAGE: "Couldn't reach the server, check your connection and try again" },
  UNEXPECTED_RESPONSE: { STATUS: "UNEXPECTED_RESPONSE", MESSAGE: "Something went wrong on our end, try again in a moment" },
} as const

export type GeneralErrorKey = keyof typeof GENERAL_ERRORS
export type GeneralError = (typeof GENERAL_ERRORS)[GeneralErrorKey]
