import { describe, expect, it } from "vitest";
import {
  knowledgeBaseDocumentCheckDecision,
  knowledgeBaseDocumentCheckId,
  knowledgeBaseDocumentCheckTaxYear,
  knowledgeBaseDocumentFromDecision,
} from "../../../services/knowledgeBase/knowledgeBaseDocumentChecks.js";

const DOC_TEXT = "Form W-2 for Taylor Mock (taylor_w2_2025.pdf).\n1 Wages, tips, other compensation: 110,000.00.";

function yesNo(answer: boolean | null, status: string, evidence = [{ id: "document", text: DOC_TEXT, relevance: 1 }]) {
  return { type: "document_noul", mode: "both", answer, status, binary: { confidence: 0.9 }, evidence };
}

const DECISION = {
  answers: {
    docType: { type: "choice", choice: "w2", probabilities: { w2: 0.89 }, confidence: 0.73, evidence: [{ id: "document", text: DOC_TEXT, relevance: 1 }] },
    tag_tax: yesNo(true, "tentative"),
    tag_earnings: yesNo(true, "confirmed"),
    member_taylor_mock: yesNo(true, "confirmed"),
    member_sam_mock: yesNo(false, "tentative"),
  },
};

function bytes(value: unknown): Uint8Array {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
}

describe("knowledgeBaseDocumentCheckDecision", () => {
  it("accepts a decision with a leading BOM and keeps unknown fields", () => {
    const decision = knowledgeBaseDocumentCheckDecision(bytes(`\uFEFF${JSON.stringify({ ...DECISION, extra: 1 })}`));

    expect(decision.answers.docType!.choice).toBe("w2");
    expect((decision as Record<string, unknown>).extra).toBe(1);
  });

  it("throws DECISION_NOT_JSON for text that isn't JSON", () => {
    expect(() => knowledgeBaseDocumentCheckDecision(bytes("not json"))).toThrow(expect.objectContaining({ _statusCode: 422, message: "The decision file is not valid JSON" }));
  });

  it("throws DECISION_INVALID when answers is missing", () => {
    expect(() => knowledgeBaseDocumentCheckDecision(bytes({ docType: {} }))).toThrow(expect.objectContaining({ message: "The decision file does not have the expected answers shape" }));
  });
});

describe("knowledgeBaseDocumentCheckId", () => {
  it("is stable for the same household and file and differs across households", () => {
    expect(knowledgeBaseDocumentCheckId("HH006", "w2.pdf")).toBe(knowledgeBaseDocumentCheckId("HH006", "w2.pdf"));
    expect(knowledgeBaseDocumentCheckId("HH006", "w2.pdf")).not.toBe(knowledgeBaseDocumentCheckId("HH001", "w2.pdf"));
  });
});

describe("knowledgeBaseDocumentCheckTaxYear", () => {
  const withEvidence = (text: string) => ({ answers: { docType: { type: "choice", choice: "w2", evidence: [{ id: "s", text }] } } });

  it("prefers a single year in the file name", () => {
    expect(knowledgeBaseDocumentCheckTaxYear("w2_2025.pdf", withEvidence("Statement 2024"))).toBe(2025);
  });

  it("falls back to a single year in the docType evidence", () => {
    expect(knowledgeBaseDocumentCheckTaxYear("w2.pdf", withEvidence("Form W-2 Wage and Tax Statement 2024"))).toBe(2024);
  });

  it("leaves the year empty when it is ambiguous", () => {
    expect(knowledgeBaseDocumentCheckTaxYear("w2_2024_2025.pdf", withEvidence("2023"))).toBeNull();
    expect(knowledgeBaseDocumentCheckTaxYear("w2.pdf", withEvidence("Covers 2023 and 2024"))).toBeNull();
  });

  it("does not read a year out of a longer number", () => {
    expect(knowledgeBaseDocumentCheckTaxYear("w2.pdf", withEvidence("Wages: 120250.00"))).toBeNull();
  });
});

describe("knowledgeBaseDocumentFromDecision", () => {
  it("keeps only confirmed yes answers as tags and members, using the keys as given", () => {
    const document = knowledgeBaseDocumentFromDecision("HH006", "taylor_w2_2025.pdf", knowledgeBaseDocumentCheckDecision(bytes(DECISION)));

    expect(document).toMatchObject({ clientId: "HH006", fileName: "taylor_w2_2025.pdf", docType: "w2", tags: ["tag_earnings"], familyMembers: ["member_taylor_mock"], taxYear: 2025 });
  });

  it("indexes repeated evidence once and keeps its text verbatim", () => {
    const document = knowledgeBaseDocumentFromDecision("HH006", "taylor_w2_2025.pdf", knowledgeBaseDocumentCheckDecision(bytes(DECISION)));

    expect(document.sections).toEqual([{ sectionId: "document", page: null, text: DOC_TEXT }]);
  });

  it("keeps two different texts that share an evidence id as separate sections", () => {
    const decision = knowledgeBaseDocumentCheckDecision(bytes({
      answers: {
        docType: { type: "choice", choice: "w2", evidence: [{ id: "section-001", text: "Header" }] },
        tag_tax: yesNo(true, "confirmed", [{ id: "section-001", text: "Box 2: 12,630.00" }, { id: "section-002", text: "Box 1: 84,200.00" }]),
      },
    }));

    expect(knowledgeBaseDocumentFromDecision("H", "f.pdf", decision).sections.map((section) => [section.sectionId, section.text])).toEqual([
      ["section-001", "Header"],
      ["section-001-2", "Box 2: 12,630.00"],
      ["section-002", "Box 1: 84,200.00"],
    ]);
  });

  it("throws DECISION_EMPTY when there is no evidence text", () => {
    const decision = knowledgeBaseDocumentCheckDecision(bytes({ answers: { docType: { type: "choice", choice: "w2", evidence: [{ id: "a", text: "  " }] } } }));

    expect(() => knowledgeBaseDocumentFromDecision("H", "f.pdf", decision)).toThrow(expect.objectContaining({ message: "The decision file has no evidence text to index" }));
  });

  it("leaves docType empty when docType is not a choice", () => {
    const decision = knowledgeBaseDocumentCheckDecision(bytes({ answers: { docType: { type: "other", evidence: [{ id: "a", text: "x" }] } } }));

    expect(knowledgeBaseDocumentFromDecision("H", "f.pdf", decision).docType).toBeNull();
  });
});
