import { describe, expect, it } from "vitest";
import { NOTE_ERRORS } from "../../../types/native/notes/errors.js";
import { noteBuildIndexEntry, noteCheckMember } from "../../../services/notes/noteChecks.js";

const NOTE = {
  id: "note-1",
  clientId: "client-1",
  memberId: null as string | null,
  title: "Roth conversion",
  text: "Wants to revisit the Roth conversion.",
  createdAt: new Date("2026-10-03T14:05:00.000Z"),
};
const HOUSEHOLD = { id: "client-1", name: "Patel Family", kind: "household" as const };
const MEMBERS = [{ id: "member-priya", name: "Priya Patel" }, { id: "member-raj", name: "Raj Patel" }];

describe("noteCheckMember", () => {
  it("allows a household-wide note", () => {
    expect(() => noteCheckMember(null, null)).not.toThrow();
  });

  it("rejects a member the client doesn't have", () => {
    expect(() => noteCheckMember("member-priya", null)).toThrow(expect.objectContaining({ _status: NOTE_ERRORS.MEMBER_NOT_FOUND.STATUS }));
  });
});

describe("noteBuildIndexEntry", () => {
  it("labels a household-wide note as all and lets every member's filter find it", () => {
    expect(noteBuildIndexEntry(NOTE, HOUSEHOLD, MEMBERS)).toEqual({
      noteId: "note-1",
      clientId: "client-1",
      title: "Roth conversion",
      bodyText: "Wants to revisit the Roth conversion.",
      household: "Patel Family",
      member: "all",
      familyMembers: ["member-priya", "member-raj"],
      date: "2026-10-03",
      time: "2:05 PM UTC",
      createdAt: "2026-10-03T14:05:00.000Z",
    });
  });

  it("names the one member a note is about", () => {
    expect(noteBuildIndexEntry({ ...NOTE, memberId: "member-priya" }, HOUSEHOLD, MEMBERS))
      .toMatchObject({ member: "Priya Patel", familyMembers: ["member-priya"] });
  });

  it("keys an individual client's note by the client, as tagging does", () => {
    expect(noteBuildIndexEntry(NOTE, { id: "client-dana", name: "Dana Whitfield", kind: "individual" }, []))
      .toMatchObject({ household: "Dana Whitfield", member: "Dana Whitfield", familyMembers: ["client-dana"] });
  });
});
