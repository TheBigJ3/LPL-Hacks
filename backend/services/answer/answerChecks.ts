import { z } from "zod";
import type { AnswerCitation, AnswerStatement } from "@lpl-hacks/shared/src/types/native/answer/answerStatement.js";
import type { RetrievalChunk } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalChunk.js";
import type { RetrievalFilter } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalFilter.js";

export type AnswerSource = {
  sourceId: string;
  chunk: RetrievalChunk;
  fileName: string | null;
  fieldIds: string[];
};

const FilterToolInputZod = z.object({
  taxYear: z.number().int().min(1900).max(2100).nullish(),
  tags: z.array(z.string()).nullish(),
});

const AnswerToolInputZod = z.object({
  answerable: z.boolean(),
  statements: z.array(z.object({
    text: z.string(),
    sourceIds: z.array(z.string()).default([]),
    fieldIds: z.array(z.string()).default([]),
  })),
});

export type AnswerToolInput = z.infer<typeof AnswerToolInputZod>;

export const ANSWER_NOT_FOUND_TEXT = "I couldn't find that in this client's documents.";

export function answerCheckFilters(clientId: string, toolInput: unknown, allowedTags: readonly string[]): RetrievalFilter {
  const parsed = FilterToolInputZod.safeParse(toolInput);
  const filters: RetrievalFilter = { clientId };

  if (!parsed.success) {
    return filters;
  }

  if (parsed.data.taxYear !== null && parsed.data.taxYear !== undefined) {
    filters.taxYear = parsed.data.taxYear;
  }

  const tags = [...new Set((parsed.data.tags ?? []).filter((tag) => allowedTags.includes(tag)))];
  if (tags.length > 0) {
    filters.tags = tags;
  }

  return filters;
}

export function answerCheckFiltersNarrowed(filters: RetrievalFilter): boolean {
  return filters.taxYear !== undefined || filters.tags !== undefined || filters.familyMember !== undefined;
}

export function answerCheckSources(chunks: RetrievalChunk[]): AnswerSource[] {
  return chunks.map((chunk, index) => ({
    sourceId: `S${index + 1}`,
    chunk,
    fileName: /"fileName":"((?:[^"\\]|\\.)*)"/.exec(chunk.text)?.[1] ?? null,
    fieldIds: [...chunk.text.matchAll(/"fieldId":"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]!),
  }));
}

export function answerCheckToolInput(toolInput: unknown): AnswerToolInput | null {
  const parsed = AnswerToolInputZod.safeParse(toolInput);
  return parsed.success ? parsed.data : null;
}

function answerCheckCitations(sourceIds: string[], fieldIds: string[], sources: AnswerSource[], verified: Map<string, boolean>): AnswerCitation[] {
  const cited = sources.filter((source) => sourceIds.includes(source.sourceId));
  const citations: AnswerCitation[] = [];

  for (const source of cited) {
    const base = { documentId: source.chunk.citation.documentId, page: source.chunk.citation.page, fileName: source.fileName };
    const sourceFieldIds = fieldIds.filter((fieldId) => source.fieldIds.includes(fieldId));

    if (sourceFieldIds.length === 0) {
      citations.push({ ...base, fieldId: null, verified: false });
    }

    for (const fieldId of sourceFieldIds) {
      citations.push({ ...base, fieldId, verified: verified.get(fieldId) ?? false });
    }
  }

  return citations;
}

// A statement whose citations all turn out to be invented is dropped, since an uncited claim must never reach the advisor.
export function answerCheckStatements(toolInput: AnswerToolInput, sources: AnswerSource[], verified: Map<string, boolean>): { answerable: boolean; statements: AnswerStatement[] } {
  if (!toolInput.answerable) {
    const text = toolInput.statements.map((statement) => statement.text.trim()).filter(Boolean).join(" ");
    return { answerable: false, statements: [{ text: text && !/\d/.test(text) ? text : ANSWER_NOT_FOUND_TEXT, citations: [] }] };
  }

  const statements = toolInput.statements
    .map((statement) => ({ text: statement.text.trim(), citations: answerCheckCitations(statement.sourceIds, statement.fieldIds, sources, verified) }))
    .filter((statement) => statement.text !== "" && statement.citations.length > 0);

  if (statements.length === 0) {
    return { answerable: false, statements: [{ text: ANSWER_NOT_FOUND_TEXT, citations: [] }] };
  }

  return { answerable: true, statements };
}
