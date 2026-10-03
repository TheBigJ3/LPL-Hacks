import type {
  KnowledgeBaseRetrievalResult,
  RetrievalFilter as BedrockRetrievalFilter,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { RetrievalChunk } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalChunk.js";
import type { RetrievalFilter } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalFilter.js";

function retrievalChunkAnyOf(key: string, values: string[]): BedrockRetrievalFilter {
  const conditions: BedrockRetrievalFilter[] = values.map((value) => ({ listContains: { key, value } }));
  return conditions.length === 1 ? conditions[0]! : { orAll: conditions };
}

export function retrievalChunkBuildFilter(filters: RetrievalFilter): BedrockRetrievalFilter {
  const conditions: BedrockRetrievalFilter[] = [{ equals: { key: "clientId", value: filters.clientId } }];

  if (filters.taxYear !== undefined) {
    conditions.push({ equals: { key: "taxYear", value: filters.taxYear } });
  }

  if (filters.docType !== undefined) {
    conditions.push({ equals: { key: "docType", value: filters.docType } });
  }

  if (filters.tags !== undefined) {
    conditions.push(retrievalChunkAnyOf("tags", filters.tags));
  }

  if (filters.familyMembers !== undefined) {
    conditions.push(retrievalChunkAnyOf("familyMembers", filters.familyMembers));
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

function retrievalChunkReadStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function retrievalChunkFromResult(result: KnowledgeBaseRetrievalResult): RetrievalChunk | null {
  const metadata: Record<string, unknown> = result.metadata ?? {};
  const documentId = retrievalChunkReadString(metadata.documentId);
  const sectionId = retrievalChunkReadString(metadata.sectionId);
  const clientId = retrievalChunkReadString(metadata.clientId);
  const text = result.content?.text;

  // A chunk that can't be cited can't back an answer, so it never leaves retrieval.
  if (documentId === null || sectionId === null || clientId === null || !text) {
    return null;
  }

  return {
    text,
    score: result.score ?? null,
    citation: { documentId, sectionId, page: retrievalChunkReadNumber(metadata.page) },
    sourceType: metadata.sourceType === "note" ? "note" : "document",
    clientId,
    fileName: retrievalChunkReadString(metadata.fileName),
    docType: retrievalChunkReadString(metadata.docType),
    tags: retrievalChunkReadStrings(metadata.tags),
    familyMembers: retrievalChunkReadStrings(metadata.familyMembers),
    taxYear: retrievalChunkReadNumber(metadata.taxYear),
    date: retrievalChunkReadString(metadata.date),
  };
}
