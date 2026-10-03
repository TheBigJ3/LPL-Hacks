import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Note, NoteColor } from "@lpl-hacks/shared/src/types/native/notes/note.js";
import { db } from "../../loaders/postgresLoader.js";
import { AppError } from "../../modules/AppError.js";
import { clientMembers, clients } from "../../schemas/clients.js";
import { notes } from "../../schemas/notes.js";
import { CLIENT_ERRORS } from "../../types/native/clients/errors.js";
import { NOTE_ERRORS } from "../../types/native/notes/errors.js";
import { noteCheckMember } from "./noteChecks.js";

type NoteRecord = typeof notes.$inferSelect;

type NoteFields = {
  memberId: string | null;
  title: string;
  html: string;
  text: string;
  color: NoteColor;
};

// A member only matches when it belongs to the note's own client, so a note can't be pinned to another household's person.
function noteMemberJoin(clientId: AnyPgColumn, memberId: string | null): SQL {
  return memberId ? and(eq(clientMembers.clientId, clientId), eq(clientMembers.id, memberId))! : sql`false`;
}

export async function noteList(advisorId: string, clientId: string): Promise<Note[]> {
  const records = await db.select()
    .from(notes)
    .where(and(eq(notes.clientId, clientId), eq(notes.advisorId, advisorId)))
    .orderBy(desc(notes.createdAt));

  return records.map(noteToView);
}

export async function noteCreate(advisorId: string, clientId: string, fields: NoteFields): Promise<Note> {
  const [owner] = await db.select({ clientId: clients.id, memberId: clientMembers.id })
    .from(clients)
    .leftJoin(clientMembers, noteMemberJoin(clients.id, fields.memberId))
    .where(and(eq(clients.id, clientId), eq(clients.advisorId, advisorId)))
    .limit(1);
  if (!owner) throw new AppError(CLIENT_ERRORS.CLIENT_NOT_FOUND);
  noteCheckMember(fields.memberId, owner.memberId);

  const [record] = await db.insert(notes)
    .values({ ...fields, clientId: owner.clientId, advisorId })
    .returning();

  return noteToView(record!);
}

export async function noteUpdate(advisorId: string, noteId: string, fields: NoteFields): Promise<Note> {
  const [owner] = await db.select({ memberId: clientMembers.id })
    .from(notes)
    .leftJoin(clientMembers, noteMemberJoin(notes.clientId, fields.memberId))
    .where(and(eq(notes.id, noteId), eq(notes.advisorId, advisorId)))
    .limit(1);
  if (!owner) throw new AppError(NOTE_ERRORS.NOTE_NOT_FOUND);
  noteCheckMember(fields.memberId, owner.memberId);

  const [record] = await db.update(notes)
    .set(fields)
    .where(and(eq(notes.id, noteId), eq(notes.advisorId, advisorId)))
    .returning();
  if (!record) throw new AppError(NOTE_ERRORS.NOTE_NOT_FOUND);

  return noteToView(record);
}

export async function noteDelete(advisorId: string, noteId: string): Promise<void> {
  const deleted = await db.delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.advisorId, advisorId)))
    .returning({ id: notes.id });
  if (deleted.length === 0) throw new AppError(NOTE_ERRORS.NOTE_NOT_FOUND);
}

function noteToView(record: NoteRecord): Note {
  return {
    id: record.id,
    clientId: record.clientId,
    memberId: record.memberId,
    title: record.title,
    html: record.html,
    text: record.text,
    color: record.color,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
