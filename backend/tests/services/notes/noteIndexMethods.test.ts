import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows, write, remove } = vi.hoisted(() => ({ rows: { selected: [] as unknown[] }, write: vi.fn(), remove: vi.fn() }));

vi.mock("../../../loaders/postgresLoader.js", () => ({
  db: { select: () => ({ from: () => ({ innerJoin: () => ({ leftJoin: () => ({ where: async () => rows.selected }) }) }) }) },
}));
vi.mock("../../../services/knowledgeBase/knowledgeBaseNoteMethods.js", () => ({ knowledgeBaseNoteWrite: write, knowledgeBaseNoteRemove: remove }));

const { noteIndexRun } = await import("../../../services/notes/noteIndexMethods.js");

const NOTE = { id: "note-1", clientId: "client-1", memberId: null, title: "Roth", text: "Revisit", createdAt: new Date("2026-10-03T14:05:00.000Z") };
const CLIENT = { id: "client-1", name: "Patel Family", kind: "household" };

beforeEach(() => {
  vi.clearAllMocks();
  rows.selected = [];
});

describe("noteIndexRun", () => {
  it("removes the note from the knowledge base once it's deleted", async () => {
    await expect(noteIndexRun("note-1")).resolves.toBe("removed");
    expect(remove).toHaveBeenCalledWith("note-1");
    expect(write).not.toHaveBeenCalled();
  });

  it("writes the note with every member of the household it was found with", async () => {
    rows.selected = [
      { note: NOTE, client: CLIENT, member: { id: "member-priya", name: "Priya Patel" } },
      { note: NOTE, client: CLIENT, member: { id: "member-raj", name: "Raj Patel" } },
    ];

    await expect(noteIndexRun("note-1")).resolves.toBe("indexed");
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ noteId: "note-1", member: "all", familyMembers: ["member-priya", "member-raj"] }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("writes a note for a client with no members", async () => {
    rows.selected = [{ note: NOTE, client: CLIENT, member: null }];

    await noteIndexRun("note-1");
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ familyMembers: [] }));
  });
});
