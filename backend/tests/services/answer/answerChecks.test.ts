import { describe, expect, it } from "vitest";
import {
  ANSWER_NOT_FOUND_TEXT,
  answerCheckFilters,
  answerCheckFiltersNarrowed,
  answerCheckSources,
  answerCheckStatements,
  answerCheckToolInput,
} from "../../../services/answer/answerChecks.js";

const TAGS = ["Tax", "Earnings", "Investments"];

function chunk(documentId: string, page: number, fieldIds: string[]) {
  const text = JSON.stringify({ documentId, page, fileName: `${documentId}.pdf`, fields: fieldIds.map((fieldId) => ({ fieldId, value: "1" })) });
  return { text, score: 0.5, citation: { documentId, page }, clientId: "h-1", tags: [], taxYear: 2025, familyMember: null };
}

describe("answerCheckFilters", () => {
  it("always keeps the caller's client and adds the model's year and known tags", () => {
    expect(answerCheckFilters("h-1", { taxYear: 2025, tags: ["Tax", "Made Up", "Tax"] }, TAGS)).toEqual({ clientId: "h-1", taxYear: 2025, tags: ["Tax"] });
  });

  it("drops a null year and an empty tag list", () => {
    expect(answerCheckFilters("h-1", { taxYear: null, tags: [] }, TAGS)).toEqual({ clientId: "h-1" });
  });

  it("falls back to the client alone when the model's input is malformed", () => {
    expect(answerCheckFilters("h-1", { taxYear: "2025", clientId: "h-2" }, TAGS)).toEqual({ clientId: "h-1" });
  });
});

describe("answerCheckFiltersNarrowed", () => {
  it("is false for a client-only filter and true once anything else is set", () => {
    expect(answerCheckFiltersNarrowed({ clientId: "h-1" })).toBe(false);
    expect(answerCheckFiltersNarrowed({ clientId: "h-1", taxYear: 2025 })).toBe(true);
  });
});

describe("answerCheckSources", () => {
  it("numbers sources and reads the file name and field ids from the page body", () => {
    expect(answerCheckSources([chunk("doc-1", 1, ["f-1", "f-2"]), chunk("doc-2", 3, [])]).map(({ sourceId, fileName, fieldIds }) => ({ sourceId, fileName, fieldIds }))).toEqual([
      { sourceId: "S1", fileName: "doc-1.pdf", fieldIds: ["f-1", "f-2"] },
      { sourceId: "S2", fileName: "doc-2.pdf", fieldIds: [] },
    ]);
  });
});

describe("answerCheckToolInput", () => {
  it("rejects input missing answerable", () => {
    expect(answerCheckToolInput({ statements: [] })).toBeNull();
  });
});

describe("answerCheckStatements", () => {
  const sources = answerCheckSources([chunk("doc-1", 1, ["f-1"]), chunk("doc-2", 2, ["f-2"])]);
  const verified = new Map([["f-1", true], ["f-2", false]]);

  it("turns source and field ids into citations carrying stored verified state", () => {
    const result = answerCheckStatements({ answerable: true, statements: [{ text: "Wages were 100.", sourceIds: ["S1"], fieldIds: ["f-1"] }] }, sources, verified);

    expect(result).toEqual({
      answerable: true,
      statements: [{ text: "Wages were 100.", citations: [{ documentId: "doc-1", page: 1, fileName: "doc-1.pdf", fieldId: "f-1", verified: true }] }],
    });
  });

  it("cites the page alone when the field id belongs to a different source", () => {
    const result = answerCheckStatements({ answerable: true, statements: [{ text: "See page.", sourceIds: ["S1"], fieldIds: ["f-2"] }] }, sources, verified);

    expect(result.statements[0]!.citations).toEqual([{ documentId: "doc-1", page: 1, fileName: "doc-1.pdf", fieldId: null, verified: false }]);
  });

  it("drops a statement whose only source id was invented", () => {
    const result = answerCheckStatements({
      answerable: true,
      statements: [
        { text: "Real.", sourceIds: ["S2"], fieldIds: ["f-2"] },
        { text: "Invented 500.", sourceIds: ["S9"], fieldIds: [] },
      ],
    }, sources, verified);

    expect(result.statements.map((statement) => statement.text)).toEqual(["Real."]);
  });

  it("becomes unanswerable when every statement is dropped", () => {
    expect(answerCheckStatements({ answerable: true, statements: [{ text: "Uncited 5.", sourceIds: [], fieldIds: [] }] }, sources, verified))
      .toEqual({ answerable: false, statements: [{ text: ANSWER_NOT_FOUND_TEXT, citations: [] }] });
  });

  it("keeps the model's explanation when unanswerable and number-free", () => {
    expect(answerCheckStatements({ answerable: false, statements: [{ text: "No mortgage statement is on file.", sourceIds: [], fieldIds: [] }] }, sources, verified).statements)
      .toEqual([{ text: "No mortgage statement is on file.", citations: [] }]);
  });

  it("replaces an unanswerable explanation that states a number", () => {
    expect(answerCheckStatements({ answerable: false, statements: [{ text: "Probably about 4000.", sourceIds: [], fieldIds: [] }] }, sources, verified).statements)
      .toEqual([{ text: ANSWER_NOT_FOUND_TEXT, citations: [] }]);
  });
});
