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
  DOCUMENTS: {
    _TAGS: ["Tax", "Earnings", "Investments", "Retirement", "Banking", "Insurance", "Estate", "Identity"],
  },
  ANSWER: {
    MAX_SOURCES: 8,
  },
}
