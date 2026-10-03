import type { KnowledgeBaseNote } from "../../types/native/knowledgeBase/knowledgeBaseNote.js";

export const KNOWLEDGE_BASE_NOTE_SECTION_ID = "note";

export function knowledgeBaseNoteBody(note: KnowledgeBaseNote): string {
  return JSON.stringify({
    title: note.title,
    body_text: note.bodyText,
    household: note.household,
    member: note.member,
    date: note.date,
    time: note.time,
  });
}

export function knowledgeBaseNoteMetadata(note: KnowledgeBaseNote): string {
  return JSON.stringify({
    metadataAttributes: {
      sourceType: "note",
      documentId: note.noteId,
      sectionId: KNOWLEDGE_BASE_NOTE_SECTION_ID,
      clientId: note.clientId,
      fileName: note.title,
      date: note.createdAt,
      // Bedrock skips a document whose metadata has an empty list.
      ...(note.familyMembers.length > 0 ? { familyMembers: note.familyMembers } : {}),
    },
  });
}
