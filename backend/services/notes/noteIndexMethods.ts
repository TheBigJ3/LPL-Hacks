import { eq } from "drizzle-orm";
import { db } from "../../loaders/postgresLoader.js";
import { clientMembers, clients } from "../../schemas/clients.js";
import { notes } from "../../schemas/notes.js";
import { knowledgeBaseNoteRemove, knowledgeBaseNoteWrite } from "../knowledgeBase/knowledgeBaseNoteMethods.js";
import { noteBuildIndexEntry } from "./noteChecks.js";

export type NoteIndexOutcome = "indexed" | "removed";

// Always indexes the note as it is now, so a replayed or out-of-order run settles on the latest save, or on its removal once deleted.
export async function noteIndexRun(noteId: string): Promise<NoteIndexOutcome> {
  const rows = await db.select({
    note: { id: notes.id, clientId: notes.clientId, memberId: notes.memberId, title: notes.title, text: notes.text, createdAt: notes.createdAt },
    client: { id: clients.id, name: clients.name, kind: clients.kind },
    member: { id: clientMembers.id, name: clientMembers.name },
  })
    .from(notes)
    .innerJoin(clients, eq(clients.id, notes.clientId))
    .leftJoin(clientMembers, eq(clientMembers.clientId, notes.clientId))
    .where(eq(notes.id, noteId));

  const [first] = rows;
  if (!first) {
    await knowledgeBaseNoteRemove(noteId);
    return "removed";
  }

  const members = rows.flatMap((row) => row.member ? [row.member] : []);
  await knowledgeBaseNoteWrite(noteBuildIndexEntry(first.note, first.client, members));
  return "indexed";
}
