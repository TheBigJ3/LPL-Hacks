import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { BEDROCK_KNOWLEDGE_BASE_BUCKET } from "../../loaders/bedrockAgentLoader.js";
import { s3_client } from "../../loaders/s3Loader.js";
import type { KnowledgeBaseNote } from "../../types/native/knowledgeBase/knowledgeBaseNote.js";
import { knowledgeBaseNoteBody, knowledgeBaseNoteMetadata } from "./knowledgeBaseNoteChecks.js";

const KNOWLEDGE_BASE_NOTE_PREFIX = "notes";

function knowledgeBaseNoteKey(noteId: string): string {
  return `${KNOWLEDGE_BASE_NOTE_PREFIX}/${noteId}/note.json`;
}

function knowledgeBaseNotePut(key: string, body: string) {
  return s3_client.send(new PutObjectCommand({ Bucket: BEDROCK_KNOWLEDGE_BASE_BUCKET, Key: key, Body: body, ContentType: "application/json" }));
}

export async function knowledgeBaseNoteWrite(note: KnowledgeBaseNote): Promise<string> {
  const key = knowledgeBaseNoteKey(note.noteId);

  await Promise.all([
    knowledgeBaseNotePut(key, knowledgeBaseNoteBody(note)),
    knowledgeBaseNotePut(`${key}.metadata.json`, knowledgeBaseNoteMetadata(note)),
  ]);

  return key;
}

export async function knowledgeBaseNoteRemove(noteId: string): Promise<void> {
  const key = knowledgeBaseNoteKey(noteId);

  await s3_client.send(new DeleteObjectsCommand({
    Bucket: BEDROCK_KNOWLEDGE_BASE_BUCKET,
    Delete: { Objects: [{ Key: key }, { Key: `${key}.metadata.json` }], Quiet: true },
  }));
}
