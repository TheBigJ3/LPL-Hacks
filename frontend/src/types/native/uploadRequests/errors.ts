export const UPLOAD_REQUEST_ERRORS = {
  CLIPBOARD_BLOCKED: { STATUS: "UNSUPPORTED",   MESSAGE: "Couldn't copy automatically. Select the link and copy it yourself" },
  LIST_LOAD_FAILED:  { STATUS: "UNAVAILABLE",   MESSAGE: "Couldn't load this client's links. Try again in a moment" },
  SOME_FILES_FAILED: { STATUS: "PARTIAL",       MESSAGE: "Some files didn't upload. Check the list and send again" },
  LINK_EXPIRED:      { STATUS: "LINK_EXPIRED",  MESSAGE: "This upload link has expired. Ask your advisor for a new one." },
  LINK_REVOKED:      { STATUS: "LINK_REVOKED",  MESSAGE: "This upload link was turned off. Ask your advisor for a new one." },
  LINK_SUBMITTED:    { STATUS: "LINK_SUBMITTED", MESSAGE: "Files were already sent with this link. Ask your advisor if you need to send more." },
  TOO_MANY_FILES:    { STATUS: "INVALID_INPUT", MESSAGE: "You've reached the file limit for this link" },
} as const

export type UploadRequestErrorKey = keyof typeof UPLOAD_REQUEST_ERRORS
export type UploadRequestError = (typeof UPLOAD_REQUEST_ERRORS)[UploadRequestErrorKey]
