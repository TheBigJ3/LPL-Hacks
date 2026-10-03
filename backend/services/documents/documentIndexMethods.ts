import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import { db } from "../../loaders/postgresLoader.js";
import { S3_DOCUMENTS_BUCKET, s3_client } from "../../loaders/s3Loader.js";
import { AppError } from "../../modules/AppError.js";
import { documents } from "../../schemas/documents.js";
import { knowledgeBaseDocumentIndexDecision } from "../knowledgeBase/knowledgeBaseDocumentMethods.js";

export type DocumentIndexOutcome = "skipped" | "indexed" | "failed";

export async function documentIndexRun(documentId: string, reviewedAt: string): Promise<DocumentIndexOutcome> {
  const [record] = await db.select({
    fileName: documents.fileName,
    clientId: documents.clientId,
    decisionS3Key: documents.decisionS3Key,
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
  if (record.indexStatus !== "pending" || !record.clientId || !record.decisionS3Key) return "skipped";

  const object = await s3_client.send(new GetObjectCommand({ Bucket: S3_DOCUMENTS_BUCKET, Key: record.decisionS3Key }));
  const decision = await object.Body!.transformToByteArray();

  try {
    await knowledgeBaseDocumentIndexDecision(record.clientId, record.fileName, decision);
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
