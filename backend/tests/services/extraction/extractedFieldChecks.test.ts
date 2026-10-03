import { describe, expect, it } from "vitest";
import {
  extractedFieldCheckConfidenceLevel,
  extractedFieldCheckValue,
  extractedFieldMeasureOverlap,
} from "../../../services/extraction/extractedFieldChecks.js";

const text = (rawText: string, confidence = 99, label: string | null = null) =>
  extractedFieldCheckValue({ tokens: [{ kind: "word", text: rawText }], confidence, label });

describe("extractedFieldCheckConfidenceLevel", () => {
  it.each([
    [95, "high"],
    [94.9, "medium"],
    [85, "medium"],
    [84.9, "low"],
    [null, "unknown"],
  ] as const)("grades %s as %s", (confidence, level) => {
    expect(extractedFieldCheckConfidenceLevel(confidence)).toBe(level);
  });
});

describe("extractedFieldMeasureOverlap", () => {
  it.each([
    ["fully inside", { left: 0.2, top: 0.2, width: 0.1, height: 0.1 }, 1],
    ["half inside", { left: 0.45, top: 0.2, width: 0.1, height: 0.1 }, 0.5],
    ["outside", { left: 0.6, top: 0.2, width: 0.1, height: 0.1 }, 0],
  ])("measures a box %s the container", (_case, box, expected) => {
    expect(extractedFieldMeasureOverlap({ left: 0, top: 0, width: 0.5, height: 0.5 }, box)).toBeCloseTo(expected);
  });

  it("returns 0 for a box with no area", () => {
    expect(extractedFieldMeasureOverlap({ left: 0, top: 0, width: 1, height: 1 }, { left: 0.5, top: 0.5, width: 0, height: 0.1 })).toBe(0);
  });
});

describe("extractedFieldCheckValue", () => {
  it.each([
    ["$ 18,750.00", 18750, "currency"],
    ["$0.00", 0, "currency"],
    ["25%", 25, "percentage"],
    ["25.00 %", 25, "percentage"],
    ["1,200", 1200, "number"],
    ["12.5", 12.5, "number"],
    ["06/30/2026", "2026-06-30", "date"],
    ["30/06/2026", "2026-06-30", "date"],
    ["2026-06-30", "2026-06-30", "date"],
    ["05/05/2026", "2026-05-05", "date"],
  ] as const)("normalizes %j to %j as %s", (rawText, normalized, dataType) => {
    expect(text(rawText)).toMatchObject({ rawValue: rawText, value: normalized, dataType, validationStatus: "valid", requiresReview: false });
  });

  it.each([
    ["001234"],
    ["95814"],
    ["0123.45"],
    ["123-45-6789"],
  ])("keeps %j as the exact string, since it may be an identifier", (rawText) => {
    expect(text(rawText)).toMatchObject({ value: rawText, dataType: "string", requiresReview: false });
  });

  it.each([
    ["$", "currency"],
    ["%", "percentage"],
    ["/", "string"],
    ["-", "string"],
    ["()", "string"],
    ["______", "string"],
  ] as const)("treats the printed placeholder %j as an empty value", (rawText, dataType) => {
    expect(text(rawText)).toMatchObject({ rawValue: rawText, value: null, dataType, requiresReview: false });
  });

  it.each([
    ["183B72"],
    ["12-34567B9"],
    ["O6/30/2026"],
  ])("keeps %j unchanged and flags letters that may be misread digits", (rawText) => {
    expect(text(rawText)).toMatchObject({ value: rawText, validationStatus: "warning", requiresReview: true });
  });

  it("doesn't flag ordinary alphanumeric text", () => {
    expect(text("1099-R")).toMatchObject({ validationStatus: "not_validated", requiresReview: false });
  });

  it("keeps a malformed amount as read and marks it invalid", () => {
    expect(text("$1,8B5.00")).toMatchObject({ value: "$1,8B5.00", dataType: "currency", validationStatus: "invalid", requiresReview: true });
  });

  it("keeps an impossible date as read and marks it invalid", () => {
    expect(text("02/31/2026")).toMatchObject({ value: "02/31/2026", validationStatus: "invalid", issues: ["Date does not exist."] });
  });

  it.each([["03/04/2026"], ["03/04/26"]])("keeps the ambiguous date %j as read and flags it", (rawText) => {
    expect(text(rawText)).toMatchObject({ value: rawText, dataType: "date", validationStatus: "warning", requiresReview: true });
  });

  it("flags any value read with low confidence without changing it", () => {
    expect(text("Roth", 84)).toMatchObject({ value: "Roth", confidenceLevel: "low", requiresReview: true, issues: ["OCR confidence is low (84.0%)."] });
  });

  it("flags a critical field read with medium confidence", () => {
    expect(text("Jane Doe", 90, "Recipient's name")).toMatchObject({ requiresReview: true, issues: ["Critical value read below 95% OCR confidence."] });
  });

  it("doesn't flag a non-critical field read with medium confidence", () => {
    expect(text("Roth", 90, "Plan type")).toMatchObject({ requiresReview: false });
  });

  it("treats amounts and dates as critical whatever their label", () => {
    expect(text("$10.00", 90, "Box 4")).toMatchObject({ requiresReview: true });
  });

  it("doesn't flag a blank critical field read with medium confidence", () => {
    expect(text("$", 90, "Amount")).toMatchObject({ value: null, requiresReview: false });
  });

  it.each([
    [true, "[x]"],
    [false, "[ ]"],
  ])("reads a single checkbox as %s", (selected, rawValue) => {
    expect(extractedFieldCheckValue({ tokens: [{ kind: "selection", selected }], confidence: 97 }))
      .toMatchObject({ rawValue, value: selected, dataType: "checkbox", requiresReview: false });
  });

  it("returns null for a checkbox read with low confidence", () => {
    expect(extractedFieldCheckValue({ tokens: [{ kind: "selection", selected: true }], confidence: 70 }))
      .toMatchObject({ value: null, dataType: "checkbox", requiresReview: true });
  });

  it("flags several unlabeled checkboxes instead of picking one", () => {
    const result = extractedFieldCheckValue({
      tokens: [{ kind: "selection", selected: true }, { kind: "selection", selected: false }],
      confidence: 97,
    });
    expect(result).toMatchObject({ value: "[x] [ ]", dataType: "string", validationStatus: "warning", requiresReview: true });
  });

  it("keeps checkboxes mixed with option text as the raw string", () => {
    const result = extractedFieldCheckValue({
      tokens: [{ kind: "selection", selected: true }, { kind: "word", text: "Yes" }, { kind: "selection", selected: false }, { kind: "word", text: "No" }],
      confidence: 97,
    });
    expect(result).toMatchObject({ value: "[x] Yes [ ] No", dataType: "string", requiresReview: false });
  });

  it("returns a missing value as null and unscored", () => {
    expect(extractedFieldCheckValue({ tokens: null, confidence: null, label: "Account number" })).toEqual({
      rawValue: null,
      value: null,
      dataType: "string",
      confidence: null,
      confidenceLevel: "unknown",
      requiresReview: false,
      validationStatus: "not_validated",
      issues: [],
    });
  });

  it("doesn't hold a checkbox to the critical-field bar because of its label", () => {
    expect(extractedFieldCheckValue({ tokens: [{ kind: "selection", selected: true }], confidence: 92, label: "Total distribution" }))
      .toMatchObject({ value: true, requiresReview: false });
  });
});
