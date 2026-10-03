export const INSIGHT_ERRORS = {
  LOAD_FAILED: { STATUS: "LOAD_FAILED", MESSAGE: "Couldn't load this client's conversation" },
} as const

export type InsightErrorKey = keyof typeof INSIGHT_ERRORS
export type InsightError = (typeof INSIGHT_ERRORS)[InsightErrorKey]
