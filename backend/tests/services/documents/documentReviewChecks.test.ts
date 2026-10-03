import { describe, expect, it } from "vitest";
import { DOCUMENT_REVIEW_TAGGING_STALE_MS, documentReviewCheckFields, documentReviewCheckTaggingBusy } from "../../../services/documents/documentReviewChecks.js";
import { DOCUMENT_ERRORS } from "../../../types/native/documents/errors.js";

const value = (requiresReview: boolean, rawValue: string | null = "1") => ({
  rawValue, value: rawValue, dataType: "string", confidence: 80, confidenceLevel: "medium", requiresReview, validationStatus: "valid", issues: [],
}) as const;

const EXTRACTION = {
  fields: [
    { id: "wages", label: "Wages", page: 1, labelBox: null, valueBox: null, ...value(true) },
    { id: "name", label: "Name", page: 1, labelBox: null, valueBox: null, ...value(false) },
  ],
  tables: [{
    id: "t1", kind: "form", page: 1, box: null, confidence: 90, confidenceLevel: "high", requiresReview: false, rowCount: 2, columnCount: 2,
    cells: [
      { id: "mirrored", box: null, row: 1, column: 2, role: "value", fieldId: "wages", ...value(true) },
      { id: "empty", box: null, row: 2, column: 2, role: "value", fieldId: null, ...value(true, null) },
    ],
  }, {
    id: "t2", kind: "data", page: 1, box: null, confidence: 90, confidenceLevel: "high", requiresReview: true, rowCount: 1, columnCount: 1,
    cells: [{ id: "cell", box: null, row: 1, column: 1, role: "value", fieldId: null, ...value(true) }],
  }],
  lines: [],
} as any;

const verified = (value: string) => ({ value, corrected: false });

describe("documentReviewCheckFields", () => {
  it("accepts a review covering every flagged item, without the field mirrors and empty form cells the screen hides", () => {
    expect(() => documentReviewCheckFields(EXTRACTION, { wages: verified("1"), cell: verified("2") })).not.toThrow();
  });

  it("rejects a review missing a flagged item", () => {
    expect(() => documentReviewCheckFields(EXTRACTION, { wages: verified("1") }))
      .toThrow(expect.objectContaining({ _status: DOCUMENT_ERRORS.REVIEW_INCOMPLETE.STATUS }));
  });

  it("rejects an id the document doesn't have, including a hidden cell", () => {
    expect(() => documentReviewCheckFields(EXTRACTION, { wages: verified("1"), cell: verified("2"), mirrored: verified("1") }))
      .toThrow(expect.objectContaining({ _status: DOCUMENT_ERRORS.REVIEW_FIELD_UNKNOWN.STATUS }));
  });
});

describe("documentReviewCheckTaggingBusy", () => {
  const now = new Date("2026-10-03T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("is free when no tagging is pending", () => {
    expect(documentReviewCheckTaggingBusy(null, null, now)).toBe(false);
    expect(documentReviewCheckTaggingBusy("tagged", ago(1_000), now)).toBe(false);
    expect(documentReviewCheckTaggingBusy("failed", ago(1_000), now)).toBe(false);
  });

  it("is busy while a pending run is younger than the stale limit", () => {
    expect(documentReviewCheckTaggingBusy("pending", ago(DOCUMENT_REVIEW_TAGGING_STALE_MS - 1), now)).toBe(true);
  });

  it("frees a pending run once it reaches the stale limit", () => {
    expect(documentReviewCheckTaggingBusy("pending", ago(DOCUMENT_REVIEW_TAGGING_STALE_MS), now)).toBe(false);
  });

  it("stays busy for a pending run with no review time, since its age can't be known", () => {
    expect(documentReviewCheckTaggingBusy("pending", null, now)).toBe(true);
  });
});
