import { and, eq, getTableColumns, inArray } from "drizzle-orm";
import type { Document } from "@lpl-hacks/shared/src/types/native/documents/document.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import documentsExtractionSettled from "@lpl-hacks/shared/src/types/native/sockets/documents/extractionSettled.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import { readUploadBody, type UploadRequest } from "../../modules/readUploadRequest.js";
import { socketRoom } from "../../modules/socketRoom.js";
import { documents } from "../../schemas/documents.js";
import { DOCUMENT_ERRORS } from "../../types/native/documents/errors.js";
import { EXTRACTION_ERRORS } from "../../types/native/extraction/errors.js";
import { extractedFieldAnalyze, type ExtractedFieldResult } from "../extraction/extractedFieldMethods.js";
import { realtimeNotifyRooms } from "../realtime/realtimeMethods.js";

type DocumentUpload = UploadRequest & {
  fileName: string;
};

// The file itself is only read by the extraction worker, so every other query leaves it behind.
const { content: _content, ...DOCUMENT_COLUMNS } = getTableColumns(documents);

type DocumentRecord = Omit<typeof documents.$inferSelect, "content">;

export type DocumentExtractOutcome = "skipped" | "extracted" | "failed";

export async function documentCreate(upload: DocumentUpload): Promise<Document> {
  const content = await readUploadBody(upload);

  const [record] = await db.insert(documents)
    .values({ fileName: upload.fileName, contentType: upload.contentType, content })
    .returning(DOCUMENT_COLUMNS);

  return documentToView(record!);
}

export async function documentGet(documentId: string): Promise<{ document: Document; extraction: ExtractedAnalysis | null }> {
  const record = await documentGetRecord(documentId);
  if (!record) throw new AppError(DOCUMENT_ERRORS.DOCUMENT_NOT_FOUND);

  return { document: documentToView(record), extraction: record.extraction ?? null };
}

export async function documentGetRecord(documentId: string): Promise<DocumentRecord | null> {
  const [record] = await db.select(DOCUMENT_COLUMNS).from(documents).where(eq(documents.id, documentId)).limit(1);
  return record ?? null;
}

export async function documentExtract(documentId: string): Promise<DocumentExtractOutcome> {
  const [record] = await db.select({ status: documents.status, contentType: documents.contentType, content: documents.content })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!record || record.status === "extracted" || record.status === "failed") return "skipped";

  await db.update(documents)
    .set({ status: "extracting" })
    .where(and(eq(documents.id, documentId), eq(documents.status, "uploaded")));

  let result: ExtractedFieldResult;
  try {
    result = await extractedFieldAnalyze(record.content, record.contentType);
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
  };
}
