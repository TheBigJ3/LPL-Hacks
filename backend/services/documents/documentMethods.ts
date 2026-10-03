import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray } from "drizzle-orm";
import type { Document } from "@lpl-hacks/shared/src/types/native/documents/document.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import documentsExtractionSettled from "@lpl-hacks/shared/src/types/native/sockets/documents/extractionSettled.js";
import { db } from "../../loaders/postgresLoader.js";
import { S3_DOCUMENTS_BUCKET, s3_client } from "../../loaders/s3Loader.js";
import { AppError } from "../../modules/AppError.js";
import { socketRoom } from "../../modules/socketRoom.js";
import { documents } from "../../schemas/documents.js";
import { DOCUMENT_ERRORS } from "../../types/native/documents/errors.js";
import { EXTRACTION_ERRORS } from "../../types/native/extraction/errors.js";
import { extractedFieldAnalyzeCollect, extractedFieldAnalyzeStart } from "../extraction/extractedFieldMethods.js";
import { realtimeNotifyRooms } from "../realtime/realtimeMethods.js";

type DocumentUpload = {
  fileName: string;
  contentType: string;
  contentLength: number;
  body: Readable;
};

type DocumentRecord = typeof documents.$inferSelect;

export type DocumentExtractCollectOutcome = "pending" | "settled";

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

  const [record] = await db.insert(documents)
    .values({ id, fileName: upload.fileName, contentType: upload.contentType, s3Key })
    .returning();

  return documentToView(record!);
}

export async function documentGet(documentId: string): Promise<{ document: Document; extraction: ExtractedAnalysis | null }> {
  const record = await documentGetRecord(documentId);
  if (!record) throw new AppError(DOCUMENT_ERRORS.DOCUMENT_NOT_FOUND);

  return { document: documentToView(record), extraction: record.extraction ?? null };
}

export async function documentGetRecord(documentId: string): Promise<DocumentRecord | null> {
  const [record] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return record ?? null;
}

export async function documentExtractStart(documentId: string): Promise<boolean> {
  const record = await documentGetRecord(documentId);
  if (!record || record.status === "extracted" || record.status === "failed") return false;
  if (record.status === "extracting") return true;

  let textractJobId: string;
  try {
    textractJobId = await extractedFieldAnalyzeStart(documentId, { bucket: S3_DOCUMENTS_BUCKET, key: record.s3Key });
  } catch (err) {
    if (!(err instanceof AppError) || err._status === EXTRACTION_ERRORS.EXTRACTION_BUSY.STATUS) throw err;
    await documentMarkFailed(documentId, err.message);
    return false;
  }

  await db.update(documents)
    .set({ status: "extracting", textractJobId })
    .where(and(eq(documents.id, documentId), eq(documents.status, "uploaded")));

  return true;
}

export async function documentExtractCollect(documentId: string): Promise<DocumentExtractCollectOutcome> {
  const record = await documentGetRecord(documentId);
  if (!record || record.status !== "extracting" || !record.textractJobId) return "settled";

  const result = await extractedFieldAnalyzeCollect(record.textractJobId);
  if (result.status === "pending") return "pending";

  if (result.status === "failed") {
    await documentMarkFailed(documentId, result.message);
    return "settled";
  }

  const updated = await db.update(documents)
    .set({ status: "extracted", pageCount: result.pageCount, extraction: result.analysis })
    .where(and(eq(documents.id, documentId), eq(documents.status, "extracting")))
    .returning({ id: documents.id });

  if (updated.length > 0) documentNotifySettled(documentId);
  return "settled";
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
  };
}
