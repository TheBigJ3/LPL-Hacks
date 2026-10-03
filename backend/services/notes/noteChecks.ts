import type { ClientKind } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import { AppError } from "../../modules/AppError.js";
import type { KnowledgeBaseNote } from "../../types/native/knowledgeBase/knowledgeBaseNote.js";
import { NOTE_ERRORS } from "../../types/native/notes/errors.js";

const NOTE_ALL_MEMBERS = "all";

const NOTE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

type NoteIndexSource = {
  id: string;
  clientId: string;
  memberId: string | null;
  title: string;
  text: string;
  createdAt: Date;
};

export function noteCheckMember(memberId: string | null, matchedMemberId: string | null): void {
  if (memberId && memberId !== matchedMemberId) throw new AppError(NOTE_ERRORS.MEMBER_NOT_FOUND);
}

// Tagging keys an individual client's documents by the client's own id, so its notes use the same id to filter alike.
export function noteBuildIndexEntry(
  note: NoteIndexSource,
  client: { id: string; name: string; kind: ClientKind },
  members: { id: string; name: string }[],
): KnowledgeBaseNote {
  const member = members.find((item) => item.id === note.memberId) ?? null;
  const individual = client.kind === "individual";

  return {
    noteId: note.id,
    clientId: note.clientId,
    title: note.title,
    bodyText: note.text,
    household: client.name,
    member: individual ? client.name : member?.name ?? NOTE_ALL_MEMBERS,
    familyMembers: individual ? [client.id] : member ? [member.id] : members.map((item) => item.id),
    date: note.createdAt.toISOString().slice(0, 10),
    time: `${NOTE_TIME_FORMAT.format(note.createdAt)} UTC`,
    createdAt: note.createdAt.toISOString(),
  };
}
