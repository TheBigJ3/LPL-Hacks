import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq, sql } from "drizzle-orm";
import documentsTagSettled from "@lpl-hacks/shared/src/types/native/sockets/documents/tagSettled.js";
import { db } from "../../loaders/postgresLoader.js";
import { S3_DOCUMENTS_BUCKET, s3_client } from "../../loaders/s3Loader.js";
import { AppError } from "../../modules/AppError.js";
import { ServerError } from "../../modules/ServerError.js";
import { socketRoom } from "../../modules/socketRoom.js";
import { clientMembers, clients } from "../../schemas/clients.js";
import { documents } from "../../schemas/documents.js";
import { OPENDECISION_ERRORS } from "../../types/native/opendecision/errors.js";
import { OpendecisionDocumentDecisionZod } from "../../types/zod/opendecision/documentDecision.js";
import { opendecisionInvoke } from "../opendecision/opendecisionMethods.js";
import { realtimeNotifyRooms } from "../realtime/realtimeMethods.js";
import { documentTagBuildPeople, documentTagBuildText, documentTagFromDecision } from "./documentTagChecks.js";

export type DocumentTagOutcome = "skipped" | "tagged" | "failed";

// The knowledge base ingest reads a client's decisions from here, keyed by client and file name.
function documentTagDecisionKey(clientId: string, fileName: string): string {
  return `decisions/${encodeURIComponent(clientId)}/${encodeURIComponent(fileName)}.json`;
}

export async function documentTagRun(documentId: string, reviewedAt: string): Promise<DocumentTagOutcome> {
  const rows = await db.select({
    fileName: documents.fileName,
    extraction: documents.extraction,
    reviewedFields: documents.reviewedFields,
    reviewedAt: documents.reviewedAt,
    tagStatus: documents.tagStatus,
    client: { id: clients.id, name: clients.name, kind: clients.kind },
    member: { id: clientMembers.id, name: clientMembers.name },
  })
    .from(documents)
    .leftJoin(clients, eq(clients.id, documents.clientId))
    .leftJoin(clientMembers, eq(clientMembers.clientId, clients.id))
    .where(eq(documents.id, documentId))
    .orderBy(asc(clientMembers.name));

  const record = rows[0];
  // A newer confirmation replaced this one, so its own job carries the work.
  if (!record || record.tagStatus !== "pending" || record.reviewedAt?.toISOString() !== reviewedAt || !record.extraction) return "skipped";

  const people = documentTagBuildPeople(record.client, rows.flatMap((row) => row.member ? [row.member] : []));
  const text = documentTagBuildText(record.extraction, record.reviewedFields ?? {});
  let decision;
  try {
    const response = await opendecisionInvoke("decision", {
      document: { name: record.fileName, text },
      members: people.map(({ name: _name, ...member }) => member),
    });
    decision = OpendecisionDocumentDecisionZod.safeParse(response);
  } catch (err) {
    if (!(err instanceof AppError) || err._status === OPENDECISION_ERRORS.ANALYSIS_BUSY.STATUS) throw err;
    await documentTagMarkFailed(documentId, reviewedAt, err.message);
    return "failed";
  }
  if (!decision.success) throw new ServerError(undefined, `[documentTag] decision for ${documentId} has an unexpected shape`);

  const { tagging, answers } = documentTagFromDecision(decision.data, people, text, new Date());
  const decisionS3Key = record.client ? documentTagDecisionKey(record.client.id, record.fileName) : null;
  if (decisionS3Key) {
    await s3_client.send(new PutObjectCommand({
      Bucket: S3_DOCUMENTS_BUCKET,
      Key: decisionS3Key,
      Body: JSON.stringify({
        decided: { docType: tagging.docType?.choice ?? null, tags: tagging.tags.map((tag) => tag.name), members: tagging.members.map((member) => member.memberId) },
        answers,
      }),
      ContentType: "application/json",
    }));
  }

  const updated = await db.update(documents)
    .set({ tagStatus: "tagged", tagging, decisionS3Key, indexStatus: decisionS3Key ? "pending" : null })
    .where(and(eq(documents.id, documentId), eq(documents.tagStatus, "pending"), eq(documents.reviewedAt, new Date(reviewedAt))))
    .returning({ id: documents.id });

  if (updated.length === 0) return "tagged";
  console.info(`[documentTag] ${record.fileName} (${documentId}) type=${tagging.docType?.choice ?? "none"} tags=[${tagging.tags.map((tag) => tag.name).join(", ")}] members=[${tagging.members.map((member) => `${member.name} (${member.basis})`).join(", ")}] decision=${decisionS3Key ?? "not stored, no client"}`);
  documentTagNotifySettled(documentId);
  return "tagged";
}

// A client's document still goes into search when tagging gives up, just without tags, so a down decision service never hides it.
export async function documentTagMarkFailed(documentId: string, reviewedAt: string, tagFailureMessage: string): Promise<boolean> {
  const updated = await db.update(documents)
    .set({ tagStatus: "failed", tagFailureMessage, indexStatus: sql`case when ${documents.clientId} is null then null else 'pending' end` })
    .where(and(eq(documents.id, documentId), eq(documents.tagStatus, "pending"), eq(documents.reviewedAt, new Date(reviewedAt))))
    .returning({ id: documents.id });

  if (updated.length === 0) return false;
  documentTagNotifySettled(documentId);
  return true;
}

function documentTagNotifySettled(documentId: string): void {
  realtimeNotifyRooms([socketRoom("document", documentId)], documentsTagSettled, { documentId });
}
