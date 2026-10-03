import type {
  KnowledgeBaseRetrievalResult,
  RetrievalFilter as BedrockRetrievalFilter,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { RetrievalChunk } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalChunk.js";
import type { RetrievalFilter } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalFilter.js";

export function retrievalChunkBuildFilter(filters: RetrievalFilter): BedrockRetrievalFilter {
  const conditions: BedrockRetrievalFilter[] = [{ equals: { key: "clientId", value: filters.clientId } }];

  if (filters.taxYear !== undefined) {
    conditions.push({ equals: { key: "taxYear", value: filters.taxYear } });
  }

  if (filters.familyMember !== undefined) {
    conditions.push({ equals: { key: "familyMember", value: filters.familyMember } });
  }

  if (filters.tags !== undefined) {
    const tagConditions: BedrockRetrievalFilter[] = filters.tags.map((tag) => ({ listContains: { key: "tags", value: tag } }));
    conditions.push(tagConditions.length === 1 ? tagConditions[0]! : { orAll: tagConditions });
  }

  // Bedrock rejects andAll with fewer than two members.
  return conditions.length === 1 ? conditions[0]! : { andAll: conditions };
}

function retrievalChunkReadString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function retrievalChunkReadNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function retrievalChunkFromResult(result: KnowledgeBaseRetrievalResult): RetrievalChunk | null {
  const metadata: Record<string, unknown> = result.metadata ?? {};
  const documentId = retrievalChunkReadString(metadata.documentId);
  const page = retrievalChunkReadNumber(metadata.page);
  const clientId = retrievalChunkReadString(metadata.clientId);
  const text = result.content?.text;

  // A chunk that can't be cited can't back an answer, so it never leaves retrieval.
  if (documentId === null || page === null || clientId === null || !text) {
    return null;
  }

  return {
    text,
    score: result.score ?? null,
    citation: { documentId, page },
    clientId,
    tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag): tag is string => typeof tag === "string") : [],
    taxYear: retrievalChunkReadNumber(metadata.taxYear),
    familyMember: retrievalChunkReadString(metadata.familyMember),
  };
}
