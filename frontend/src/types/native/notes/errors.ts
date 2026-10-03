export const NOTE_ERRORS = {
  CLIPBOARD_UNAVAILABLE: { STATUS: "CLIPBOARD_UNAVAILABLE", MESSAGE: "Couldn't read your clipboard. Allow clipboard access or paste with ⌘V" },
  CLIPBOARD_EMPTY:       { STATUS: "CLIPBOARD_EMPTY", MESSAGE: "Your clipboard is empty" },
  LOAD_FAILED:           { STATUS: "LOAD_FAILED", MESSAGE: "Couldn't load this client's notes" },
} as const

export type NoteErrorKey = keyof typeof NOTE_ERRORS
export type NoteError = (typeof NOTE_ERRORS)[NoteErrorKey]
