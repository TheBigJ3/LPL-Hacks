import { describe, expect, it } from "vitest";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import type { DocumentTagging } from "@lpl-hacks/shared/src/types/native/documents/documentTagging.js";
import { documentIndexBuildDocument, documentIndexBuildPages } from "../../../services/documents/documentIndexChecks.js";
import { knowledgeBaseDocumentPageBody } from "../../../services/knowledgeBase/knowledgeBaseDocumentChecks.js";

const box = (top: number) => ({ left: 0.1, top, width: 0.3, height: 0.02 });

const field = (id: string, label: string, rawValue: string, page: number, confidence: number, top: number) => ({
  id, label, page, rawValue, value: rawValue, dataType: "string" as const, confidence, confidenceLevel: "high" as const,
  requiresReview: false, validationStatus: "not_validated" as const, issues: [], labelBox: null, valueBox: box(top),
});

const extraction: ExtractedAnalysis = {
  fields: [
    field("wages", "Wages:", "110,000.00", 1, 99.2, 0.2),
    field("employer", "Employer", "Acme Corp", 1, 96.4, 0.3),
    field("ssn", "SSN", "", 1, 90, 0.4),
    field("state", "State wages", "9,000.00", 2, 81.6, 0.5),
  ],
  tables: [],
  lines: [
    { text: "W-2 Wage and Tax Statement 2025", confidence: 99, confidenceLevel: "high", page: 1, box: box(0.05) },
    { text: "Wages 110,000.00", confidence: 99, confidenceLevel: "high", page: 1, box: box(0.2) },
    { text: "State wages 9,000.00", confidence: 80, confidenceLevel: "medium", page: 2, box: box(0.5) },
  ],
};

const tagging: DocumentTagging = {
  docType: { choice: "w2", evidence: [{ id: "document", text: "W-2 Wage and Tax Statement 2025" }] },
  tags: [{ name: "income", source: "docType", evidence: [] }],
  members: [{ memberId: "member-1", name: "Taylor Reed", basis: "fullName", evidence: [] }],
  taggedAt: "2026-10-03T12:00:00.000Z",
};

describe("documentIndexBuildPages", () => {
  it("groups fields and lines by page, skipping empty values", () => {
    const pages = documentIndexBuildPages(extraction, {});

    expect(pages.map((page) => page.page)).toEqual([1, 2]);
    expect(pages[0]!.fields.map((entry) => entry.label)).toEqual(["Wages", "Employer"]);
    expect(pages[1]!.lines).toEqual(["State wages 9,000.00"]);
  });

  it("marks reviewed fields verified and applies corrections to the field and the page text", () => {
    const pages = documentIndexBuildPages(extraction, {
      wages: { value: "111,000.00", corrected: true },
      employer: { value: "Acme Corp", corrected: false },
    });

    expect(pages[0]!.fields).toEqual([
      { fieldId: "wages", label: "Wages", value: "111,000.00", confidence: 99.2, verified: true, corrected: true },
      { fieldId: "employer", label: "Employer", value: "Acme Corp", confidence: 96.4, verified: true, corrected: false },
    ]);
    expect(pages[0]!.lines).toContain("Wages 111,000.00");
    expect(pages[1]!.fields[0]).toMatchObject({ verified: false, corrected: false });
  });
});

describe("documentIndexBuildDocument", () => {
  it("keys the document by its own id and takes type, year, tags and members from tagging", () => {
    const document = documentIndexBuildDocument({ id: "doc-uuid", clientId: "client-1", fileName: "taylor_w2.pdf", pageCount: 2, extraction, reviewedFields: {}, tagging });

    expect(document).toMatchObject({
      documentId: "doc-uuid",
      clientId: "client-1",
      docType: "w2",
      taxYear: 2025,
      tags: ["income"],
      familyMembers: ["member-1"],
      memberNames: ["Taylor Reed"],
      pageCount: 2,
    });
  });
});

describe("knowledgeBaseDocumentPageBody", () => {
  it("labels every field with its verification state and confidence", () => {
    const document = documentIndexBuildDocument({
      id: "doc-uuid", clientId: "client-1", fileName: "taylor_w2.pdf", pageCount: 2, extraction,
      reviewedFields: { wages: { value: "111,000.00", corrected: true }, employer: { value: "Acme Corp", corrected: false } }, tagging,
    });

    expect(knowledgeBaseDocumentPageBody(document, document.pages[0]!)).toBe([
      "Document: taylor_w2.pdf",
      "Type: w2 · Tax year: 2025 · Page 1 of 2",
      "Members: Taylor Reed",
      "",
      "Fields:",
      "- Wages: 111,000.00 [corrected by advisor]",
      "- Employer: Acme Corp [verified]",
      "",
      "Page text:",
      "W-2 Wage and Tax Statement 2025",
      "Wages 111,000.00",
    ].join("\n"));
    expect(knowledgeBaseDocumentPageBody(document, document.pages[1]!)).toContain("- State wages: 9,000.00 [unverified, 82% confidence]");
  });
});
