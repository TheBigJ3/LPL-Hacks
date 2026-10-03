// Properties with _ in front mean its public
export default  {
  RATE_LIMIT: {
    ANON_CAPACITY: 100,
    ANON_REFILL_PER_SEC: 2.5,
    AUTH_CAPACITY: 200,
    AUTH_REFILL_PER_SEC: 5,
    IPV6_PREFIX: 64
  },
  EXTRACTION: {
    CONFIDENCE_HIGH: 95,
    CONFIDENCE_MEDIUM: 85,
  },
  ANSWER: {
    MAX_SOURCES: 8,
  },
  INSIGHT: {
    MAX_SOURCES: 8,
    MAX_TOOL_ROUNDS: 6,
    PROGRESS_INTERVAL_MS: 150,
    QUOTE_MAX_CHARS: 600,
    STALE_ANSWER_MS: 5 * 60 * 1000,
  },
}
