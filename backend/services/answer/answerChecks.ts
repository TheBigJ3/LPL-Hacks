import { z } from "zod";
import type { AnswerCitation, AnswerStatement } from "@lpl-hacks/shared/src/types/native/answer/answerStatement.js";
import type { RetrievalChunk } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalChunk.js";
import type { RetrievalFilter } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalFilter.js";

export type AnswerSource = {
  sourceId: string;
  chunk: RetrievalChunk;
  quote: string;
};

const FilterToolInputZod = z.object({
  taxYear: z.number().int().min(1900).max(2100).nullish(),
});

const AnswerToolInputZod = z.object({
  answerable: z.boolean(),
  statements: z.array(z.object({
    text: z.string(),
    sourceIds: z.array(z.string()).default([]),
  })),
});

export type AnswerToolInput = z.infer<typeof AnswerToolInputZod>;

export const ANSWER_NOT_FOUND_TEXT = "I couldn't find that in this client's documents.";

export function answerCheckFilters(clientId: string, toolInput: unknown): RetrievalFilter {
  const parsed = FilterToolInputZod.safeParse(toolInput);
  const filters: RetrievalFilter = { clientId };

  if (parsed.success && parsed.data.taxYear !== null && parsed.data.taxYear !== undefined) {
    filters.taxYear = parsed.data.taxYear;
  }

  return filters;
}

export function answerCheckFiltersNarrowed(filters: RetrievalFilter): boolean {
  return filters.taxYear !== undefined || filters.tags !== undefined || filters.familyMembers !== undefined || filters.docType !== undefined;
}

function answerCheckQuote(chunkText: string): string {
  try {
    const body: unknown = JSON.parse(chunkText);
    if (body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string") {
      return (body as { text: string }).text;
    }
  } catch {
    return chunkText;
  }
  return chunkText;
}

export function answerCheckSources(chunks: RetrievalChunk[]): AnswerSource[] {
  return chunks.map((chunk, index) => ({ sourceId: `S${index + 1}`, chunk, quote: answerCheckQuote(chunk.text) }));
}

export function answerCheckToolInput(toolInput: unknown): AnswerToolInput | null {
  const parsed = AnswerToolInputZod.safeParse(toolInput);
  return parsed.success ? parsed.data : null;
}

function answerCheckCitations(sourceIds: string[], sources: AnswerSource[]): AnswerCitation[] {
  return sources
    .filter((source) => sourceIds.includes(source.sourceId))
    .map((source) => ({
      documentId: source.chunk.citation.documentId,
      sectionId: source.chunk.citation.sectionId,
      sourceType: source.chunk.sourceType,
      page: source.chunk.citation.page,
      fileName: source.chunk.fileName,
      quote: source.quote,
      // Nothing is advisor-verified until a verification store exists.
      verified: false,
    }));
}

// A statement whose citations all turn out to be invented is dropped, since an uncited claim must never reach the advisor.
export function answerCheckStatements(toolInput: AnswerToolInput, sources: AnswerSource[]): { answerable: boolean; statements: AnswerStatement[] } {
  if (!toolInput.answerable) {
    const text = toolInput.statements.map((statement) => statement.text.trim()).filter(Boolean).join(" ");
    return { answerable: false, statements: [{ text: text && !/\d/.test(text) ? text : ANSWER_NOT_FOUND_TEXT, citations: [] }] };
  }

  const statements = toolInput.statements
    .map((statement) => ({ text: statement.text.trim(), citations: answerCheckCitations(statement.sourceIds, sources) }))
    .filter((statement) => statement.text !== "" && statement.citations.length > 0);

  if (statements.length === 0) {
    return { answerable: false, statements: [{ text: ANSWER_NOT_FOUND_TEXT, citations: [] }] };
  }

  return { answerable: true, statements };
}
