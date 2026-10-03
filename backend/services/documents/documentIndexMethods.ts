import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import { documents } from "../../schemas/documents.js";
import { knowledgeBaseDocumentIndexPages } from "../knowledgeBase/knowledgeBaseDocumentMethods.js";
import { documentIndexBuildDocument } from "./documentIndexChecks.js";

export type DocumentIndexOutcome = "skipped" | "indexed" | "failed";

export async function documentIndexRun(documentId: string, reviewedAt: string): Promise<DocumentIndexOutcome> {
  const [record] = await db.select({
    fileName: documents.fileName,
    clientId: documents.clientId,
    pageCount: documents.pageCount,
    extraction: documents.extraction,
    reviewedFields: documents.reviewedFields,
    tagging: documents.tagging,
    tagStatus: documents.tagStatus,
    indexStatus: documents.indexStatus,
    reviewedAt: documents.reviewedAt,
  })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  // A newer confirmation re-tags the document, and that run queues its own index job.
  if (!record || record.reviewedAt?.toISOString() !== reviewedAt) return "skipped";
  // A replay after the index commit still reports it, so the job queues the sync it may have missed.
  if (record.indexStatus === "indexed") return "indexed";
  if (record.indexStatus !== "pending" || !record.clientId || !record.extraction) return "skipped";
  if (!record.tagging && record.tagStatus !== "failed") return "skipped";

  const document = documentIndexBuildDocument({
    id: documentId,
    clientId: record.clientId,
    fileName: record.fileName,
    pageCount: record.pageCount,
    extraction: record.extraction,
    reviewedFields: record.reviewedFields ?? {},
    tagging: record.tagging,
  });

  try {
    await knowledgeBaseDocumentIndexPages(document);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    console.warn(`[documentIndex] ${record.fileName} (${documentId}) not indexed: ${err.message}`);
    await documentIndexMarkFailed(documentId, reviewedAt);
    return "failed";
  }

  const updated = await db.update(documents)
    .set({ indexStatus: "indexed" })
    .where(and(eq(documents.id, documentId), eq(documents.indexStatus, "pending"), eq(documents.reviewedAt, new Date(reviewedAt))))
    .returning({ id: documents.id });

  return updated.length > 0 ? "indexed" : "skipped";
}

export async function documentIndexMarkFailed(documentId: string, reviewedAt: string): Promise<boolean> {
  const updated = await db.update(documents)
    .set({ indexStatus: "failed" })
    .where(and(eq(documents.id, documentId), eq(documents.indexStatus, "pending"), eq(documents.reviewedAt, new Date(reviewedAt))))
    .returning({ id: documents.id });

  return updated.length > 0;
}

// Marks every tagged, client-linked document for indexing again, for a backfill after the page format changes.
export async function documentIndexRequeueTagged(): Promise<{ id: string; reviewedAt: string }[]> {
  const requeued = await db.update(documents)
    .set({ indexStatus: "pending" })
    .where(and(eq(documents.tagStatus, "tagged"), isNotNull(documents.clientId), isNotNull(documents.reviewedAt)))
    .returning({ id: documents.id, reviewedAt: documents.reviewedAt });

  return requeued.flatMap((row) => row.reviewedAt ? [{ id: row.id, reviewedAt: row.reviewedAt.toISOString() }] : []);
}
