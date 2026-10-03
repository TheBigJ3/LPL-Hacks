import { createHash } from "crypto";
import { AppError } from "../../modules/AppError.js";
import { KNOWLEDGE_BASE_ERRORS } from "../../types/native/knowledgeBase/errors.js";
import type {
  KnowledgeBaseDocument,
  KnowledgeBaseDocumentPage,
  KnowledgeBaseIndexedDocument,
  KnowledgeBasePageField,
  KnowledgeBaseSection,
} from "../../types/native/knowledgeBase/index.js";
import type { RawDecision } from "../../types/native/knowledgeBase/rawDecision.js";
import { RawDecisionZod } from "../../types/zod/knowledgeBase/rawDecision.js";

const TAG_PREFIX = "tag_";
const MEMBER_PREFIX = "member_";
const YEAR_PATTERN = /(?<!\d)(19\d{2}|20\d{2})(?!\d)/g;

export function knowledgeBaseDocumentCheckDecision(rawBytes: Uint8Array): RawDecision {
  let parsed: unknown;

  try {
    // A BOM only affects parsing here; the stored original keeps it.
    parsed = JSON.parse(Buffer.from(rawBytes).toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new AppError(KNOWLEDGE_BASE_ERRORS.DECISION_NOT_JSON);
  }

  const result = RawDecisionZod.safeParse(parsed);

  if (!result.success) {
    throw new AppError(KNOWLEDGE_BASE_ERRORS.DECISION_INVALID);
  }

  return result.data;
}

export function knowledgeBaseDocumentCheckId(clientId: string, fileName: string): string {
  return createHash("sha256").update(`${clientId}\n${fileName}`).digest("hex").slice(0, 32);
}

// Only a confirmed yes counts, matching how the decision service itself decides tags.
function knowledgeBaseDocumentConfirmedKeys(decision: RawDecision, prefix: string): string[] {
  return Object.entries(decision.answers)
    .filter(([key, answer]) => key.startsWith(prefix) && answer.answer === true && answer.status === "confirmed")
    .map(([key]) => key);
}

function knowledgeBaseDocumentYears(text: string): number[] {
  return [...new Set([...text.matchAll(YEAR_PATTERN)].map((match) => Number(match[1])))];
}

export function knowledgeBaseDocumentCheckTaxYearFrom(fileName: string, evidenceTexts: string[]): number | null {
  const fromFileName = knowledgeBaseDocumentYears(fileName);

  if (fromFileName.length === 1) {
    return fromFileName[0]!;
  }

  if (fromFileName.length > 1) {
    return null;
  }

  const fromDocType = knowledgeBaseDocumentYears(evidenceTexts.join("\n"));
  return fromDocType.length === 1 ? fromDocType[0]! : null;
}

export function knowledgeBaseDocumentCheckTaxYear(fileName: string, decision: RawDecision): number | null {
  return knowledgeBaseDocumentCheckTaxYearFrom(fileName, (decision.answers.docType?.evidence ?? []).map((evidence) => evidence.text));
}

function knowledgeBaseDocumentSections(decision: RawDecision): KnowledgeBaseSection[] {
  const sections: KnowledgeBaseSection[] = [];
  const textsById = new Map<string, string[]>();

  for (const answer of Object.values(decision.answers)) {
    for (const evidence of answer.evidence ?? []) {
      if (evidence.text.trim() === "") {
        continue;
      }

      const seen = textsById.get(evidence.id) ?? [];
      if (seen.includes(evidence.text)) {
        continue;
      }

      seen.push(evidence.text);
      textsById.set(evidence.id, seen);
      sections.push({ sectionId: seen.length === 1 ? evidence.id : `${evidence.id}-${seen.length}`, page: null, text: evidence.text });
    }
  }

  return sections;
}

export function knowledgeBaseDocumentFromDecision(clientId: string, fileName: string, decision: RawDecision): KnowledgeBaseDocument {
  const sections = knowledgeBaseDocumentSections(decision);

  if (sections.length === 0) {
    throw new AppError(KNOWLEDGE_BASE_ERRORS.DECISION_EMPTY);
  }

  const docType = decision.answers.docType;
  const { decided } = decision;

  return {
    documentId: knowledgeBaseDocumentCheckId(clientId, fileName),
    clientId,
    fileName,
    docType: decided ? decided.docType : docType?.type === "choice" && docType.choice ? docType.choice : null,
    tags: decided ? decided.tags : knowledgeBaseDocumentConfirmedKeys(decision, TAG_PREFIX),
    familyMembers: decided ? decided.members : knowledgeBaseDocumentConfirmedKeys(decision, MEMBER_PREFIX),
    taxYear: knowledgeBaseDocumentCheckTaxYear(fileName, decision),
    sections,
  };
}

export function knowledgeBaseDocumentPageSectionId(page: number): string {
  return `page-${page}`;
}

function knowledgeBaseDocumentFieldStatus(field: KnowledgeBasePageField): string {
  if (field.corrected) return "corrected by advisor";
  if (field.verified) return "verified";
  return field.confidence === null ? "unverified" : `unverified, ${Math.round(field.confidence)}% confidence`;
}

// Plain text rather than JSON, so every chunk the knowledge base splits a page into still reads on its own.
export function knowledgeBaseDocumentPageBody(document: KnowledgeBaseIndexedDocument, page: KnowledgeBaseDocumentPage): string {
  const header = [
    `Document: ${document.fileName}`,
    `Type: ${document.docType ?? "unknown"} · Tax year: ${document.taxYear ?? "unknown"} · Page ${page.page} of ${document.pageCount}`,
    `Members: ${document.memberNames.join(", ") || "none tagged"}`,
  ];
  const fields = page.fields.length > 0
    ? ["", "Fields:", ...page.fields.map((field) => `- ${field.label}: ${field.value} [${knowledgeBaseDocumentFieldStatus(field)}]`)]
    : [];
  const text = page.lines.length > 0 ? ["", "Page text:", ...page.lines] : [];

  return [...header, ...fields, ...text].join("\n");
}

export function knowledgeBaseDocumentPageMetadata(document: KnowledgeBaseIndexedDocument, page: KnowledgeBaseDocumentPage): string {
  return JSON.stringify({
    metadataAttributes: {
      sourceType: "document",
      documentId: document.documentId,
      clientId: document.clientId,
      fileName: document.fileName,
      sectionId: knowledgeBaseDocumentPageSectionId(page.page),
      page: page.page,
      // Bedrock skips a document whose metadata has an empty list, so empty lists are left out like the other optional keys.
      ...(document.tags.length > 0 ? { tags: document.tags } : {}),
      ...(document.familyMembers.length > 0 ? { familyMembers: document.familyMembers } : {}),
      ...(document.docType !== null ? { docType: document.docType } : {}),
      ...(document.taxYear !== null ? { taxYear: document.taxYear } : {}),
    },
  });
}

export function knowledgeBaseDocumentCheckIndexable(document: KnowledgeBaseIndexedDocument): KnowledgeBaseIndexedDocument {
  const pages = document.pages.filter((page) => page.fields.length > 0 || page.lines.length > 0);

  if (pages.length === 0) {
    throw new AppError(KNOWLEDGE_BASE_ERRORS.DOCUMENT_EMPTY);
  }

  return { ...document, pages };
}
