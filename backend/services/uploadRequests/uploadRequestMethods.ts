import { randomBytes } from "crypto";
import { and, asc, count, desc, eq, getTableColumns } from "drizzle-orm";
import type { Document } from "@lpl-hacks/shared/src/types/native/documents/document.js";
import type { UploadRequest, UploadRequestExpiryDays } from "@lpl-hacks/shared/src/types/native/uploadRequests/uploadRequest.js";
import type { UploadRequestPortal } from "@lpl-hacks/shared/src/types/native/uploadRequests/uploadRequestPortal.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import { clients } from "../../schemas/clients.js";
import { documents } from "../../schemas/documents.js";
import { uploadRequests } from "../../schemas/uploadRequests.js";
import { CLIENT_ERRORS } from "../../types/native/clients/errors.js";
import { UPLOAD_REQUEST_ERRORS } from "../../types/native/uploadRequests/errors.js";
import {
  UPLOAD_REQUEST_MAX_FILES,
  uploadRequestCheckCanAddFile,
  uploadRequestCheckCanSubmit,
  uploadRequestCheckState,
} from "./uploadRequestChecks.js";

const UPLOAD_REQUEST_TOKEN_BYTES = 24;
const UPLOAD_REQUEST_DAY_MS = 24 * 60 * 60 * 1000;

type UploadRequestRecord = typeof uploadRequests.$inferSelect;

type UploadRequestDraft = {
  advisorId: string;
  requestedBy: string;
  clientId: string;
  note?: string;
  expiresInDays: UploadRequestExpiryDays;
};

const UPLOAD_REQUEST_DOCUMENT_COLUMNS = {
  id: documents.id,
  fileName: documents.fileName,
  status: documents.status,
  pageCount: documents.pageCount,
  failureMessage: documents.failureMessage,
};

const UPLOAD_REQUEST_LIFECYCLE_COLUMNS = {
  id: uploadRequests.id,
  clientId: uploadRequests.clientId,
  status: uploadRequests.status,
  expiresAt: uploadRequests.expiresAt,
  documentCount: count(documents.id),
};

export async function uploadRequestCreate(draft: UploadRequestDraft): Promise<UploadRequest> {
  const [client] = await db.select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, draft.clientId), eq(clients.advisorId, draft.advisorId)))
    .limit(1);
  if (!client) throw new AppError(CLIENT_ERRORS.CLIENT_NOT_FOUND);

  const [record] = await db.insert(uploadRequests)
    .values({
      clientId: client.id,
      advisorId: draft.advisorId,
      requestedBy: draft.requestedBy,
      token: randomBytes(UPLOAD_REQUEST_TOKEN_BYTES).toString("base64url"),
      note: draft.note || null,
      expiresAt: new Date(Date.now() + draft.expiresInDays * UPLOAD_REQUEST_DAY_MS),
    })
    .returning();

  return uploadRequestToView(record!, [], new Date());
}

export async function uploadRequestList(advisorId: string, clientId: string): Promise<UploadRequest[]> {
  const rows = await db.select({ request: getTableColumns(uploadRequests), document: UPLOAD_REQUEST_DOCUMENT_COLUMNS })
    .from(uploadRequests)
    .leftJoin(documents, eq(documents.uploadRequestId, uploadRequests.id))
    .where(and(eq(uploadRequests.clientId, clientId), eq(uploadRequests.advisorId, advisorId)))
    .orderBy(desc(uploadRequests.createdAt), asc(documents.createdAt));

  const byId = new Map<string, { record: UploadRequestRecord; documents: Document[] }>();
  for (const { request, document } of rows) {
    const entry = byId.get(request.id) ?? byId.set(request.id, { record: request, documents: [] }).get(request.id)!;
    if (document) entry.documents.push(document);
  }

  const now = new Date();
  return [...byId.values()].map((entry) => uploadRequestToView(entry.record, entry.documents, now));
}

export async function uploadRequestRevoke(advisorId: string, uploadRequestId: string): Promise<void> {
  const updated = await db.update(uploadRequests)
    .set({ status: "revoked" })
    .where(and(eq(uploadRequests.id, uploadRequestId), eq(uploadRequests.advisorId, advisorId), eq(uploadRequests.status, "open")))
    .returning({ id: uploadRequests.id });
  if (updated.length > 0) return;

  const [record] = await db.select({ id: uploadRequests.id })
    .from(uploadRequests)
    .where(and(eq(uploadRequests.id, uploadRequestId), eq(uploadRequests.advisorId, advisorId)))
    .limit(1);
  throw new AppError(record ? UPLOAD_REQUEST_ERRORS.REQUEST_NOT_OPEN : UPLOAD_REQUEST_ERRORS.REQUEST_NOT_FOUND);
}

export async function uploadRequestGetPortal(token: string): Promise<UploadRequestPortal> {
  const [record] = await db.select({
    clientName: clients.name,
    requestedBy: uploadRequests.requestedBy,
    note: uploadRequests.note,
    status: uploadRequests.status,
    expiresAt: uploadRequests.expiresAt,
  })
    .from(uploadRequests)
    .innerJoin(clients, eq(clients.id, uploadRequests.clientId))
    .where(eq(uploadRequests.token, token))
    .limit(1);
  if (!record) throw new AppError(UPLOAD_REQUEST_ERRORS.REQUEST_NOT_FOUND);

  return {
    clientName: record.clientName,
    requestedBy: record.requestedBy,
    note: record.note,
    state: uploadRequestCheckState(record, new Date()),
    expiresAt: record.expiresAt.toISOString(),
    maxFiles: UPLOAD_REQUEST_MAX_FILES,
  };
}

export async function uploadRequestGetUploadTarget(token: string): Promise<{ uploadRequestId: string; clientId: string }> {
  const record = await uploadRequestGetLifecycle(token);
  uploadRequestCheckCanAddFile(record, new Date());
  return { uploadRequestId: record.id, clientId: record.clientId };
}

export async function uploadRequestSubmit(token: string): Promise<number> {
  const record = await uploadRequestGetLifecycle(token);
  uploadRequestCheckCanSubmit(record, new Date());

  const updated = await db.update(uploadRequests)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(and(eq(uploadRequests.id, record.id), eq(uploadRequests.status, "open")))
    .returning({ id: uploadRequests.id });
  if (updated.length === 0) throw new AppError(UPLOAD_REQUEST_ERRORS.REQUEST_NOT_OPEN);

  return record.documentCount;
}

async function uploadRequestGetLifecycle(token: string) {
  const [record] = await db.select(UPLOAD_REQUEST_LIFECYCLE_COLUMNS)
    .from(uploadRequests)
    .leftJoin(documents, eq(documents.uploadRequestId, uploadRequests.id))
    .where(eq(uploadRequests.token, token))
    .groupBy(uploadRequests.id)
    .limit(1);
  if (!record) throw new AppError(UPLOAD_REQUEST_ERRORS.REQUEST_NOT_FOUND);
  return record;
}

function uploadRequestToView(record: UploadRequestRecord, requestDocuments: Document[], now: Date): UploadRequest {
  return {
    id: record.id,
    clientId: record.clientId,
    token: record.token,
    note: record.note,
    state: uploadRequestCheckState(record, now),
    expiresAt: record.expiresAt.toISOString(),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    documents: requestDocuments,
  };
}
