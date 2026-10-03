import { PutObjectCommand } from "@aws-sdk/client-s3";
import { StartIngestionJobCommand } from "@aws-sdk/client-bedrock-agent";
import { s3_client } from "../../loaders/s3Loader.js";
import {
  bedrock_agent_client,
  BEDROCK_DATA_SOURCE_ID,
  BEDROCK_KNOWLEDGE_BASE_BUCKET,
  BEDROCK_KNOWLEDGE_BASE_ID,
} from "../../loaders/bedrockAgentLoader.js";
import type { KnowledgeBaseDocument, KnowledgeBasePage } from "../../types/native/knowledgeBase/index.js";

const KNOWLEDGE_BASE_PREFIX = "documents";

function knowledgeBaseDocumentPageKey(documentId: string, page: number): string {
  return `${KNOWLEDGE_BASE_PREFIX}/${documentId}/page-${page}.json`;
}

function knowledgeBaseDocumentPageBody(document: KnowledgeBaseDocument, page: KnowledgeBasePage): string {
  return JSON.stringify({
    documentId: document.documentId,
    page: page.page,
    fileName: document.fileName,
    formType: document.formType ?? null,
    taxYear: document.taxYear ?? null,
    familyMember: document.familyMember ?? null,
    tags: document.tags,
    text: page.text,
    fields: page.fields.map((field) => ({
      fieldId: field.fieldId,
      key: field.key,
      value: field.value,
      confidence: field.confidence,
      documentId: document.documentId,
      page: page.page,
    })),
  });
}

function knowledgeBaseDocumentPageMetadata(document: KnowledgeBaseDocument, page: KnowledgeBasePage): string {
  return JSON.stringify({
    metadataAttributes: {
      documentId: document.documentId,
      page: page.page,
      clientId: document.clientId,
      tags: document.tags,
      ...(document.taxYear !== undefined ? { taxYear: document.taxYear } : {}),
      ...(document.familyMember !== undefined ? { familyMember: document.familyMember } : {}),
    },
  });
}

function knowledgeBaseDocumentPut(key: string, body: string) {
  return s3_client.send(new PutObjectCommand({
    Bucket: BEDROCK_KNOWLEDGE_BASE_BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/json",
  }));
}

// One object per page so every retrieved chunk carries exactly one page to cite.
export async function knowledgeBaseDocumentWrite(document: KnowledgeBaseDocument): Promise<string[]> {
  const keys = document.pages.map((page) => knowledgeBaseDocumentPageKey(document.documentId, page.page));

  await Promise.all(document.pages.flatMap((page, index) => [
    knowledgeBaseDocumentPut(keys[index]!, knowledgeBaseDocumentPageBody(document, page)),
    knowledgeBaseDocumentPut(`${keys[index]!}.metadata.json`, knowledgeBaseDocumentPageMetadata(document, page)),
  ]));

  return keys;
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
