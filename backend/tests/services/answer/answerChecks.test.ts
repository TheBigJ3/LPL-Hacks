import { describe, expect, it } from "vitest";
import {
  ANSWER_NOT_FOUND_TEXT,
  answerCheckFilters,
  answerCheckFiltersNarrowed,
  answerCheckSources,
  answerCheckStatements,
  answerCheckToolInput,
} from "../../../services/answer/answerChecks.js";

function chunk(documentId: string, sectionId: string, quote: string) {
  const text = JSON.stringify({ documentId, sectionId, text: quote });
  return { text, score: 0.5, citation: { documentId, sectionId, page: null }, clientId: "h-1", fileName: `${documentId}.pdf`, docType: "w2", tags: [], familyMembers: [], taxYear: 2025 };
}

describe("answerCheckFilters", () => {
  it("always keeps the caller's client and adds the model's year", () => {
    expect(answerCheckFilters("h-1", { taxYear: 2025 })).toEqual({ clientId: "h-1", taxYear: 2025 });
  });

  it("drops a null year", () => {
    expect(answerCheckFilters("h-1", { taxYear: null })).toEqual({ clientId: "h-1" });
  });

  it("falls back to the client alone when the model's input is malformed", () => {
    expect(answerCheckFilters("h-1", { taxYear: "2025", clientId: "h-2" })).toEqual({ clientId: "h-1" });
  });
});

describe("answerCheckFiltersNarrowed", () => {
  it("is false for a client-only filter and true once anything else is set", () => {
    expect(answerCheckFiltersNarrowed({ clientId: "h-1" })).toBe(false);
    expect(answerCheckFiltersNarrowed({ clientId: "h-1", taxYear: 2025 })).toBe(true);
  });
});

describe("answerCheckSources", () => {
  it("numbers sources and quotes the section's own text, not the indexed wrapper", () => {
    const sources = answerCheckSources([chunk("doc-1", "document", "Wages: 1.00"), { ...chunk("doc-2", "s", "x"), text: "not json" }]);

    expect(sources.map(({ sourceId, quote }) => ({ sourceId, quote }))).toEqual([
      { sourceId: "S1", quote: "Wages: 1.00" },
      { sourceId: "S2", quote: "not json" },
    ]);
  });
});

describe("answerCheckToolInput", () => {
  it("rejects input missing answerable", () => {
    expect(answerCheckToolInput({ statements: [] })).toBeNull();
  });
});

describe("answerCheckStatements", () => {
  const sources = answerCheckSources([chunk("doc-1", "document", "Wages: 100.00"), chunk("doc-2", "section-002", "Box 2: 5.00")]);

  it("turns source ids into section citations with the quote, unverified", () => {
    expect(answerCheckStatements({ answerable: true, statements: [{ text: "Wages were 100.", sourceIds: ["S1"] }] }, sources)).toEqual({
      answerable: true,
      statements: [{ text: "Wages were 100.", citations: [{ documentId: "doc-1", sectionId: "document", page: null, fileName: "doc-1.pdf", quote: "Wages: 100.00", verified: false }] }],
    });
  });

  it("drops a statement whose only source id was invented", () => {
    const result = answerCheckStatements({
      answerable: true,
      statements: [
        { text: "Real.", sourceIds: ["S2"] },
        { text: "Invented 500.", sourceIds: ["S9"] },
      ],
    }, sources);

    expect(result.statements.map((statement) => statement.text)).toEqual(["Real."]);
  });

  it("becomes unanswerable when every statement is dropped", () => {
    expect(answerCheckStatements({ answerable: true, statements: [{ text: "Uncited 5.", sourceIds: [] }] }, sources))
      .toEqual({ answerable: false, statements: [{ text: ANSWER_NOT_FOUND_TEXT, citations: [] }] });
  });

  it("keeps the model's explanation when unanswerable and number-free", () => {
    expect(answerCheckStatements({ answerable: false, statements: [{ text: "No mortgage statement is on file.", sourceIds: [] }] }, sources).statements)
      .toEqual([{ text: "No mortgage statement is on file.", citations: [] }]);
  });

  it("replaces an unanswerable explanation that states a number", () => {
    expect(answerCheckStatements({ answerable: false, statements: [{ text: "Probably about 4000.", sourceIds: [] }] }, sources).statements)
      .toEqual([{ text: ANSWER_NOT_FOUND_TEXT, citations: [] }]);
  });
});
