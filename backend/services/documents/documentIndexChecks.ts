import type { DocumentReviewField } from "@lpl-hacks/shared/src/types/native/documents/documentReview.js";
import type { DocumentTagging } from "@lpl-hacks/shared/src/types/native/documents/documentTagging.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import type {
  KnowledgeBaseDocumentPage,
  KnowledgeBaseIndexedDocument,
  KnowledgeBasePageField,
} from "../../types/native/knowledgeBase/index.js";
import { knowledgeBaseDocumentCheckTaxYearFrom } from "../knowledgeBase/knowledgeBaseDocumentChecks.js";
import { documentTagCorrectLine, documentTagCorrections, documentTagFormatValue } from "./documentTagChecks.js";

export type DocumentIndexSource = {
  id: string;
  clientId: string;
  fileName: string;
  pageCount: number | null;
  extraction: ExtractedAnalysis;
  reviewedFields: Record<string, DocumentReviewField>;
  tagging: DocumentTagging;
};

export function documentIndexBuildPages(extraction: ExtractedAnalysis, reviewed: Record<string, DocumentReviewField>): KnowledgeBaseDocumentPage[] {
  const corrections = documentTagCorrections(extraction, reviewed);
  const pages = new Map<number, KnowledgeBaseDocumentPage>();
  const pageFor = (page: number) => pages.get(page) ?? pages.set(page, { page, fields: [], lines: [] }).get(page)!;

  for (const field of extraction.fields) {
    const review = reviewed[field.id];
    const value = documentTagFormatValue(review ? review.value : field.rawValue);
    if (value === null) continue;
    const entry: KnowledgeBasePageField = {
      fieldId: field.id,
      label: field.label.replace(/:\s*$/, ""),
      value,
      confidence: field.confidence,
      verified: review !== undefined,
      corrected: review?.corrected ?? false,
    };
    pageFor(field.page).fields.push(entry);
  }

  for (const line of extraction.lines) {
    const text = documentTagCorrectLine(line, corrections).trim();
    if (text) pageFor(line.page).lines.push(text);
  }

  return [...pages.values()].sort((a, b) => a.page - b.page);
}

export function documentIndexBuildDocument(source: DocumentIndexSource): KnowledgeBaseIndexedDocument {
  const pages = documentIndexBuildPages(source.extraction, source.reviewedFields);
  const { tagging } = source;

  return {
    documentId: source.id,
    clientId: source.clientId,
    fileName: source.fileName,
    docType: tagging.docType?.choice ?? null,
    taxYear: knowledgeBaseDocumentCheckTaxYearFrom(source.fileName, (tagging.docType?.evidence ?? []).map((evidence) => evidence.text)),
    tags: tagging.tags.map((tag) => tag.name),
    familyMembers: tagging.members.map((member) => member.memberId),
    memberNames: tagging.members.map((member) => member.name),
    pageCount: source.pageCount ?? Math.max(1, ...pages.map((page) => page.page)),
    pages,
  };
}
