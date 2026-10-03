import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, getTableColumns, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { Document, DocumentListItem } from "@lpl-hacks/shared/src/types/native/documents/document.js";
import type { DocumentReview, DocumentReviewField } from "@lpl-hacks/shared/src/types/native/documents/documentReview.js";
import type { DocumentTagging } from "@lpl-hacks/shared/src/types/native/documents/documentTagging.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import documentsExtractionSettled from "@lpl-hacks/shared/src/types/native/sockets/documents/extractionSettled.js";
import { db } from "../../loaders/postgresLoader.js";
import { S3_DOCUMENTS_BUCKET, s3_client } from "../../loaders/s3Loader.js";
import { AppError } from "../../modules/AppError.js";
import { isForeignKeyViolation } from "../../modules/pgError.js";
import type { UploadRequest } from "../../modules/readUploadRequest.js";
import { socketRoom } from "../../modules/socketRoom.js";
import { clients } from "../../schemas/clients.js";
import { documents } from "../../schemas/documents.js";
import { CLIENT_ERRORS } from "../../types/native/clients/errors.js";
import { DOCUMENT_ERRORS } from "../../types/native/documents/errors.js";
import { EXTRACTION_ERRORS } from "../../types/native/extraction/errors.js";
import { extractedFieldAnalyze, type ExtractedFieldResult } from "../extraction/extractedFieldMethods.js";
import { realtimeNotifyRooms } from "../realtime/realtimeMethods.js";
import { DOCUMENT_REVIEW_TAGGING_STALE_MS, documentReviewCheckFields, documentReviewCheckTaggingBusy } from "./documentReviewChecks.js";

type DocumentUpload = UploadRequest & {
  fileName: string;
  clientId?: string;
  uploadRequestId?: string;
};

// The file streams to S3. Textract's sync API takes 10 MB per call; PDFs are analyzed a page at a time, so only images and TIFFs hit that cap.
export const DOCUMENT_UPLOAD_RULES = {
  mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/tiff"],
  maxBytes: 50 * 1024 * 1024,
} as const;

type DocumentRecord = typeof documents.$inferSelect;

export type DocumentExtractOutcome = "skipped" | "extracted" | "failed";

// The request body streams straight into S3, so an upload is never held in memory whole.
export async function documentCreate(upload: DocumentUpload): Promise<Document> {
  const id = randomUUID();
  const s3Key = `documents/${id}`;

  await s3_client.send(new PutObjectCommand({
    Bucket: S3_DOCUMENTS_BUCKET,
    Key: s3Key,
    Body: upload.body,
    ContentType: upload.contentType,
    ContentLength: upload.contentLength,
  }));

  try {
    const [record] = await db.insert(documents)
      .values({ id, fileName: upload.fileName, contentType: upload.contentType, s3Key, clientId: upload.clientId, uploadRequestId: upload.uploadRequestId })
      .returning();

    return documentToView(record!);
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new AppError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
    throw err;
  }
}

export async function documentGetContent(documentId: string): Promise<{ contentType: string; body: Readable }> {
  const [record] = await db.select({ contentType: documents.contentType, s3Key: documents.s3Key })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!record) throw new AppError(DOCUMENT_ERRORS.DOCUMENT_NOT_FOUND);

  const object = await s3_client.send(new GetObjectCommand({ Bucket: S3_DOCUMENTS_BUCKET, Key: record.s3Key }));
  return { contentType: record.contentType, body: object.Body as Readable };
}

export async function documentGet(documentId: string): Promise<{
  document: Document;
  extraction: ExtractedAnalysis | null;
  review: DocumentReview | null;
  tagging: DocumentTagging | null;
}> {
  const record = await documentGetRecord(documentId);
  if (!record) throw new AppError(DOCUMENT_ERRORS.DOCUMENT_NOT_FOUND);

  return {
    document: documentToView(record),
    extraction: record.extraction ?? null,
    review: record.reviewedAt && record.reviewedFields ? { reviewedAt: record.reviewedAt.toISOString(), fields: record.reviewedFields } : null,
    tagging: record.tagging ?? null,
  };
}

// Saving the review is what makes its fields verified; it also hands the document to tagging, replacing any earlier result.
export async function documentConfirm(documentId: string, fields: Record<string, DocumentReviewField>): Promise<{ document: Document; reviewedAt: string }> {
  const [record] = await db.select({ status: documents.status, extraction: documents.extraction, tagStatus: documents.tagStatus, reviewedAt: documents.reviewedAt })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!record) throw new AppError(DOCUMENT_ERRORS.DOCUMENT_NOT_FOUND);
  if (record.status !== "extracted" || !record.extraction) throw new AppError(DOCUMENT_ERRORS.DOCUMENT_NOT_EXTRACTED);
  const reviewedAt = new Date();
  if (documentReviewCheckTaggingBusy(record.tagStatus, record.reviewedAt, reviewedAt)) throw new AppError(DOCUMENT_ERRORS.TAGGING_IN_PROGRESS);
  documentReviewCheckFields(record.extraction, fields);

  const [updated] = await db.update(documents)
    .set({ reviewedFields: fields, reviewedAt, tagStatus: "pending", tagging: null, tagFailureMessage: null, indexStatus: null })
    .where(and(
      eq(documents.id, documentId),
      eq(documents.status, "extracted"),
      or(
        isNull(documents.tagStatus),
        ne(documents.tagStatus, "pending"),
        lt(documents.reviewedAt, new Date(reviewedAt.getTime() - DOCUMENT_REVIEW_TAGGING_STALE_MS)),
      ),
    ))
    .returning();
  if (!updated) throw new AppError(DOCUMENT_ERRORS.TAGGING_IN_PROGRESS);

  return { document: documentToView(updated), reviewedAt: reviewedAt.toISOString() };
}

export async function documentList(advisorId: string, clientId: string): Promise<DocumentListItem[]> {
  const rows = await db.select({ record: getTableColumns(documents) })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(eq(documents.clientId, clientId), eq(clients.advisorId, advisorId)))
    .orderBy(desc(documents.createdAt));

  return rows.map(({ record }) => ({
    ...documentToView(record),
    createdAt: record.createdAt.toISOString(),
    tagging: record.tagging ?? null,
  }));
}

export async function documentGetRecord(documentId: string): Promise<DocumentRecord | null> {
  const [record] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return record ?? null;
}

export async function documentExtract(documentId: string): Promise<DocumentExtractOutcome> {
  const record = await documentGetRecord(documentId);
  if (!record || record.status === "extracted" || record.status === "failed") return "skipped";

  // Textract's sync API takes the bytes, not an S3 location, since a PDF is split into pages before it's sent.
  const [object] = await Promise.all([
    s3_client.send(new GetObjectCommand({ Bucket: S3_DOCUMENTS_BUCKET, Key: record.s3Key })),
    db.update(documents)
      .set({ status: "extracting" })
      .where(and(eq(documents.id, documentId), eq(documents.status, "uploaded"))),
  ]);
  const content = await object.Body!.transformToByteArray();

  let result: ExtractedFieldResult;
  try {
    result = await extractedFieldAnalyze(content, record.contentType);
  } catch (err) {
    if (!(err instanceof AppError) || err._status === EXTRACTION_ERRORS.EXTRACTION_BUSY.STATUS) throw err;
    await documentMarkFailed(documentId, err.message);
    return "failed";
  }

  const updated = await db.update(documents)
    .set({ status: "extracted", pageCount: result.pageCount, extraction: result.analysis })
    .where(and(eq(documents.id, documentId), eq(documents.status, "extracting")))
    .returning({ id: documents.id });

  if (updated.length > 0) documentNotifySettled(documentId);
  return "extracted";
}

export async function documentMarkFailed(documentId: string, failureMessage: string): Promise<boolean> {
  const updated = await db.update(documents)
    .set({ status: "failed", failureMessage })
    .where(and(eq(documents.id, documentId), inArray(documents.status, ["uploaded", "extracting"])))
    .returning({ id: documents.id });

  if (updated.length === 0) return false;
  documentNotifySettled(documentId);
  return true;
}

function documentNotifySettled(documentId: string): void {
  realtimeNotifyRooms([socketRoom("document", documentId)], documentsExtractionSettled, { documentId });
}

function documentToView(record: DocumentRecord): Document {
  return {
    id: record.id,
    fileName: record.fileName,
    status: record.status,
    pageCount: record.pageCount,
    failureMessage: record.failureMessage,
    tagStatus: record.tagStatus,
    tagFailureMessage: record.tagFailureMessage,
    indexStatus: record.indexStatus,
  };
}
