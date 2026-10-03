import type { DocumentReviewField } from "@lpl-hacks/shared/src/types/native/documents/documentReview.js";
import type { DocumentTagEvidence, DocumentTagging, DocumentTagMemberBasis } from "@lpl-hacks/shared/src/types/native/documents/documentTagging.js";
import type { ClientKind } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import type { ExtractedBox } from "@lpl-hacks/shared/src/types/native/extraction/extractedBox.js";
import type { ExtractedLine } from "@lpl-hacks/shared/src/types/native/extraction/extractedField.js";
import type {
  OpendecisionAnswer,
  OpendecisionDocumentDecision,
  OpendecisionMember,
} from "../../types/native/opendecision/documentDecision.js";

export type DocumentTagPerson = OpendecisionMember & { name: string };

const DOCUMENT_TAG_PREFIX = "tag_";
const DOCUMENT_TAG_UNKNOWN_TYPE = "unknown";

// Mirrors the topics in opendecision-microservice/config/doc_types.json; a test fails if the two drift apart.
export const DOCUMENT_TAG_DOC_TYPE_TOPICS: Record<string, string[]> = {
  w2: ["income", "retirement", "tax"],
  "1099_int": ["income", "banking_cash", "tax"],
  "1099_r": ["retirement", "tax"],
  "1099_div": ["income", "investments", "tax"],
  "1099_nec": ["income", "self_employment", "tax"],
  "1040": ["income", "tax"],
  "1098": ["mortgage_housing", "tax"],
  "5498_sa": ["health_savings"],
  "1095": ["health_savings", "insurance"],
  account_statement: ["banking_cash"],
};

export function documentTagBuildPeople(
  client: { id: string; name: string; kind: ClientKind } | null,
  members: { id: string; name: string }[],
): DocumentTagPerson[] {
  if (!client) return [];
  const people = client.kind === "individual" ? [{ id: client.id, name: client.name }] : members;
  // The decision service needs a first and a last name, so a single-word name can't be asked about.
  return people.flatMap((person) => {
    const parts = person.name.trim().split(/\s+/);
    if (parts.length < 2) return [];
    const middle = parts.slice(1, -1).join(" ");
    return [{
      first_name: parts[0]!,
      ...(middle ? { middle_name: middle } : {}),
      last_name: parts.at(-1)!,
      person_id: person.id,
      name: person.name,
    }];
  });
}

function documentTagFormatValue(value: string | number | boolean | null): string | null {
  if (value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "checked" : "not checked";
  return String(value);
}

type DocumentTagCorrection = {
  page: number;
  box: ExtractedBox | null;
  rawValue: string;
  value: string;
};

const DOCUMENT_TAG_LINE_OVERLAP = 0.5;

function documentTagOverlap(a: ExtractedBox, b: ExtractedBox): number {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / Math.min(a.width * a.height, b.width * b.height);
}

function documentTagCorrections(extraction: ExtractedAnalysis, reviewed: Record<string, DocumentReviewField>): DocumentTagCorrection[] {
  const items = [
    ...extraction.fields.map((field) => ({ id: field.id, page: field.page, box: field.valueBox, rawValue: field.rawValue })),
    ...extraction.tables.flatMap((table) => table.cells.map((cell) => ({ id: cell.id, page: table.page, box: cell.box, rawValue: cell.rawValue }))),
  ];
  return items.flatMap((item) => {
    const review = reviewed[item.id];
    if (!review?.corrected || typeof review.value !== "string" || !item.rawValue) return [];
    return [{ page: item.page, box: item.box, rawValue: item.rawValue, value: review.value }];
  });
}

// A correction replaces the value where Textract read it on the page too, so the page text can't contradict it.
function documentTagCorrectLine(line: ExtractedLine, corrections: DocumentTagCorrection[]): string {
  return corrections.reduce((text, correction) => {
    if (correction.page !== line.page) return text;
    const located = correction.box && line.box
      ? documentTagOverlap(correction.box, line.box) >= DOCUMENT_TAG_LINE_OVERLAP
      : text.trim() === correction.rawValue;
    if (!located) return text;
    return text.includes(correction.rawValue) ? text.replace(correction.rawValue, correction.value) : correction.value;
  }, line.text);
}

export function documentTagBuildText(extraction: ExtractedAnalysis, reviewed: Record<string, DocumentReviewField>): string {
  const fieldLines = extraction.fields.flatMap((field) => {
    const value = documentTagFormatValue(field.id in reviewed ? reviewed[field.id]!.value : field.rawValue);
    return value === null ? [] : [`${field.label.replace(/:\s*$/, "")}: ${value}`];
  });
  const corrections = documentTagCorrections(extraction, reviewed);
  const pageLines = extraction.lines.map((line) => documentTagCorrectLine(line, corrections));
  return [...fieldLines, "", ...pageLines].join("\n").trim();
}

function documentTagConfirmed(answer: OpendecisionAnswer | undefined, value: boolean): boolean {
  return answer?.answer === value && answer.status === "confirmed";
}

function documentTagEvidence(answer: OpendecisionAnswer | undefined): DocumentTagEvidence[] {
  return (answer?.evidence ?? []).map((evidence) => ({ id: evidence.id, text: evidence.text }));
}

// Single letters are kept, since an initial is often all a form prints of a first name.
function documentTagTokens(text: string): string[] {
  return text.toLowerCase().replace(/[’]/g, "'").replace(/'s\b/g, "").split(/[^a-z0-9]+/).filter(Boolean);
}

// Up to one token may sit between the two (a middle name or initial), in either order ("Whitfield, Dana").
function documentTagNear(tokens: string[], first: (token: string) => boolean, second: (token: string) => boolean): boolean {
  return tokens.some((token, index) => first(token) && [1, 2].some((gap) => second(tokens[index + gap] ?? "")))
    || tokens.some((token, index) => second(token) && [1, 2].some((gap) => first(tokens[index + gap] ?? "")));
}

export type DocumentTagNameMatch = "fullName" | "initials" | "oneName";

const DOCUMENT_TAG_MATCH_STRENGTH: Record<DocumentTagNameMatch, number> = { fullName: 3, initials: 2, oneName: 1 };

export function documentTagMatchName(tokens: string[], person: DocumentTagPerson): DocumentTagNameMatch | null {
  const first = documentTagTokens(person.first_name)[0];
  const last = documentTagTokens(person.last_name).at(-1);
  if (!first || !last) return null;

  const isFirst = (token: string) => token === first;
  const isLast = (token: string) => token === last;
  const isFirstInitial = (token: string) => token === first[0];
  const isLastInitial = (token: string) => token === last[0];

  if (documentTagNear(tokens, isFirst, isLast)) return "fullName";
  if (documentTagNear(tokens, isFirstInitial, isLast) || documentTagNear(tokens, isFirst, isLastInitial)) return "initials";
  // OCR often prints spaced initials ("D W") as one word.
  if (tokens.includes(`${first[0]}${last[0]}`) || documentTagNear(tokens, isFirstInitial, isLastInitial)) return "initials";
  if (tokens.includes(last) || tokens.includes(first)) return "oneName";
  return null;
}

// Topics follow the document type and the model only adds a tag it confirms. A member needs some trace of their
// name on the document: a full name stands unless the model confirms a no. A partial name (initials, one name)
// stands when nobody else on the client matches as strongly, otherwise it needs the model's yes.
export function documentTagFromDecision(decision: OpendecisionDocumentDecision, people: DocumentTagPerson[], text: string, taggedAt: Date): {
  tagging: DocumentTagging;
  answers: Record<string, OpendecisionAnswer>;
} {
  const { docType } = decision;
  const choice = docType.choice && docType.choice !== DOCUMENT_TAG_UNKNOWN_TYPE ? docType.choice : null;
  const typeTopics = (choice ? DOCUMENT_TAG_DOC_TYPE_TOPICS[choice] ?? [] : []).map((name) => ({ name, source: "docType" as const, evidence: documentTagEvidence(docType) }));
  const modelTags = Object.entries(decision.tags)
    .filter(([, answer]) => documentTagConfirmed(answer, true))
    .map(([key, answer]) => ({ name: key.startsWith(DOCUMENT_TAG_PREFIX) ? key.slice(DOCUMENT_TAG_PREFIX.length) : key, source: "model" as const, evidence: documentTagEvidence(answer) }))
    .filter((tag) => !typeTopics.some((topic) => topic.name === tag.name));

  const tokens = documentTagTokens(text);
  const memberAnswers = Object.values(decision.members);
  const matches = people.map((person) => documentTagMatchName(tokens, person));
  const strengths = matches.map((match) => match ? DOCUMENT_TAG_MATCH_STRENGTH[match] : 0);
  const onlyCandidate = (index: number) => strengths.every((strength, other) => other === index || strength < strengths[index]!);

  return {
    tagging: {
      docType: choice ? { choice, evidence: documentTagEvidence(docType) } : null,
      tags: [...typeTopics, ...modelTags],
      members: people.flatMap((person, index) => {
        const answer = memberAnswers[index];
        const match = matches[index];
        if (!match || documentTagConfirmed(answer, false)) return [];
        const basis: DocumentTagMemberBasis | null = match === "fullName" ? "fullName"
          : answer?.answer === true ? "partialName"
            : onlyCandidate(index) ? "onlyCandidate" : null;
        return basis ? [{ memberId: person.person_id, name: person.name, basis, evidence: documentTagEvidence(answer) }] : [];
      }),
      taggedAt: taggedAt.toISOString(),
    },
    answers: { docType, ...decision.tags, ...decision.members },
  };
}
