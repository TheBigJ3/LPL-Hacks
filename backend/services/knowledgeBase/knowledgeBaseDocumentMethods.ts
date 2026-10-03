import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { StartIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";
import { S3_DOCUMENTS_BUCKET, s3_client } from "../../loaders/s3Loader.js";
import {
  bedrock_agent_client,
  BEDROCK_DATA_SOURCE_ID,
  BEDROCK_KNOWLEDGE_BASE_BUCKET,
  BEDROCK_KNOWLEDGE_BASE_ID,
} from "../../loaders/bedrockAgentLoader.js";
import { ServerError } from "../../modules/ServerError.js";
import type { KnowledgeBaseDocument, KnowledgeBaseSection } from "../../types/native/knowledgeBase/index.js";
import {
  knowledgeBaseDocumentCheckDecision,
  knowledgeBaseDocumentCheckId,
  knowledgeBaseDocumentFromDecision,
} from "./knowledgeBaseDocumentChecks.js";

const KNOWLEDGE_BASE_PREFIX = "documents";
const DECISION_PREFIX = "decisions";

// The original carries raw model scores the LLM must never see, so it can't live where the knowledge base indexes.
if (S3_DOCUMENTS_BUCKET === BEDROCK_KNOWLEDGE_BASE_BUCKET) {
  throw new ServerError(undefined, "[knowledgeBase] S3_DOCUMENTS_BUCKET must differ from BEDROCK_KNOWLEDGE_BASE_BUCKET");
}

export type KnowledgeBaseDocumentIngestResult = {
  document: KnowledgeBaseDocument;
  originalKey: string;
  sectionKeys: string[];
  removedKeys: string[];
};

function knowledgeBaseDocumentPrefix(documentId: string): string {
  return `${KNOWLEDGE_BASE_PREFIX}/${documentId}/`;
}

function knowledgeBaseDocumentSectionKey(documentId: string, sectionId: string): string {
  return `${knowledgeBaseDocumentPrefix(documentId)}${encodeURIComponent(sectionId)}.json`;
}

function knowledgeBaseDocumentOriginalKey(clientId: string, fileName: string): string {
  return `${DECISION_PREFIX}/${encodeURIComponent(clientId)}/${encodeURIComponent(fileName)}.json`;
}

function knowledgeBaseDocumentSectionBody(document: KnowledgeBaseDocument, section: KnowledgeBaseSection): string {
  return JSON.stringify({
    documentId: document.documentId,
    fileName: document.fileName,
    sectionId: section.sectionId,
    page: section.page,
    docType: document.docType,
    taxYear: document.taxYear,
    familyMembers: document.familyMembers,
    tags: document.tags,
    text: section.text,
  });
}

function knowledgeBaseDocumentSectionMetadata(document: KnowledgeBaseDocument, section: KnowledgeBaseSection): string {
  return JSON.stringify({
    metadataAttributes: {
      documentId: document.documentId,
      clientId: document.clientId,
      fileName: document.fileName,
      sectionId: section.sectionId,
      tags: document.tags,
      familyMembers: document.familyMembers,
      ...(section.page !== null ? { page: section.page } : {}),
      ...(document.docType !== null ? { docType: document.docType } : {}),
      ...(document.taxYear !== null ? { taxYear: document.taxYear } : {}),
    },
  });
}

function knowledgeBaseDocumentPut(bucket: string, key: string, body: string | Uint8Array) {
  return s3_client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/json" }));
}

async function knowledgeBaseDocumentListKeys(documentId: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await s3_client.send(new ListObjectsV2Command({
      Bucket: BEDROCK_KNOWLEDGE_BASE_BUCKET,
      Prefix: knowledgeBaseDocumentPrefix(documentId),
      ContinuationToken: continuationToken,
    }));
    keys.push(...(page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])));
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function knowledgeBaseDocumentDeleteKeys(bucket: string, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += 1_000) {
    await s3_client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.slice(start, start + 1_000).map((Key) => ({ Key })), Quiet: true },
    }));
  }
}

// Re-ingesting the same household + file overwrites it, and sections the new decision no longer has are removed.
export async function knowledgeBaseDocumentIngestDecision(clientId: string, fileName: string, rawBytes: Uint8Array): Promise<KnowledgeBaseDocumentIngestResult> {
  const decision = knowledgeBaseDocumentCheckDecision(rawBytes);
  const document = knowledgeBaseDocumentFromDecision(clientId, fileName, decision);
  const originalKey = knowledgeBaseDocumentOriginalKey(clientId, fileName);
  const sectionKeys = document.sections.map((section) => knowledgeBaseDocumentSectionKey(document.documentId, section.sectionId));

  const [existingKeys] = await Promise.all([
    knowledgeBaseDocumentListKeys(document.documentId),
    knowledgeBaseDocumentPut(S3_DOCUMENTS_BUCKET, originalKey, rawBytes),
    ...document.sections.flatMap((section, index) => [
      knowledgeBaseDocumentPut(BEDROCK_KNOWLEDGE_BASE_BUCKET, sectionKeys[index]!, knowledgeBaseDocumentSectionBody(document, section)),
      knowledgeBaseDocumentPut(BEDROCK_KNOWLEDGE_BASE_BUCKET, `${sectionKeys[index]!}.metadata.json`, knowledgeBaseDocumentSectionMetadata(document, section)),
    ]),
  ]);

  const writtenKeys = new Set(sectionKeys.flatMap((key) => [key, `${key}.metadata.json`]));
  const removedKeys = existingKeys.filter((key) => !writtenKeys.has(key));
  await knowledgeBaseDocumentDeleteKeys(BEDROCK_KNOWLEDGE_BASE_BUCKET, removedKeys);

  return { document, originalKey, sectionKeys, removedKeys };
}

export async function knowledgeBaseDocumentRemove(clientId: string, fileName: string): Promise<string[]> {
  const indexedKeys = await knowledgeBaseDocumentListKeys(knowledgeBaseDocumentCheckId(clientId, fileName));

  await Promise.all([
    knowledgeBaseDocumentDeleteKeys(BEDROCK_KNOWLEDGE_BASE_BUCKET, indexedKeys),
    knowledgeBaseDocumentDeleteKeys(S3_DOCUMENTS_BUCKET, [knowledgeBaseDocumentOriginalKey(clientId, fileName)]),
  ]);

  return indexedKeys;
}

// clientToken makes a retried start for the same window a no-op instead of a second ingestion run.
export async function knowledgeBaseDocumentSyncStart(window: number): Promise<string | undefined> {
  const response = await bedrock_agent_client.send(new StartIngestionJobCommand({
    knowledgeBaseId: BEDROCK_KNOWLEDGE_BASE_ID,
    dataSourceId: BEDROCK_DATA_SOURCE_ID,
    clientToken: `knowledge-base-sync-window-${String(window).padStart(10, "0")}`,
  }));

  return response.ingestionJob?.ingestionJobId;
}
