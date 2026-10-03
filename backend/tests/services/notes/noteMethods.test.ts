import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERRORS } from "../../../types/native/clients/errors.js";
import { NOTE_ERRORS } from "../../../types/native/notes/errors.js";

const { db, rows } = vi.hoisted(() => {
  const rows = { owner: [] as unknown[], inserted: [] as unknown[], updated: [] as unknown[], deleted: [] as unknown[], sets: [] as unknown[] };
  const returned = (values: Record<string, unknown>) => ({ id: "note-1", createdAt: new Date(0), updatedAt: new Date(0), ...values });

  const db = {
    select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: async () => rows.owner }) }) }) })),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        rows.inserted.push(values);
        return { returning: async () => [returned(values)] };
      },
    })),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        rows.sets.push(values);
        return { where: () => ({ returning: async () => rows.updated.map(() => returned({ clientId: "client-1", ...values })) }) };
      },
    })),
    delete: vi.fn(() => ({ where: () => ({ returning: async () => rows.deleted }) })),
  };

  return { db, rows };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));

const { noteCreate, noteDelete, noteUpdate } = await import("../../../services/notes/noteMethods.js");

const CLIENT_ID = "6a1f7c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b";
const MEMBER_ID = "0f9e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c";
const FIELDS = { memberId: MEMBER_ID, title: "Roth conversion", html: "<p>Revisit</p>", text: "Revisit", color: "mint" as const };

beforeEach(() => {
  vi.clearAllMocks();
  rows.owner = [];
  rows.inserted = [];
  rows.updated = [];
  rows.deleted = [];
  rows.sets = [];
});

describe("noteCreate", () => {
  it("saves the note under the advisor and the resolved client", async () => {
    rows.owner = [{ clientId: CLIENT_ID, memberId: MEMBER_ID }];

    await expect(noteCreate("advisor", CLIENT_ID, FIELDS)).resolves.toMatchObject({ clientId: CLIENT_ID, memberId: MEMBER_ID, title: "Roth conversion" });
    expect(rows.inserted).toEqual([{ ...FIELDS, clientId: CLIENT_ID, advisorId: "advisor" }]);
  });

  it("rejects a client the advisor doesn't own", async () => {
    await expect(noteCreate("advisor", CLIENT_ID, FIELDS)).rejects.toMatchObject({ _status: CLIENT_ERRORS.CLIENT_NOT_FOUND.STATUS });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a member from outside the client", async () => {
    rows.owner = [{ clientId: CLIENT_ID, memberId: null }];

    await expect(noteCreate("advisor", CLIENT_ID, FIELDS)).rejects.toMatchObject({ _status: NOTE_ERRORS.MEMBER_NOT_FOUND.STATUS });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("saves a household-wide note with no member", async () => {
    rows.owner = [{ clientId: CLIENT_ID, memberId: null }];

    await noteCreate("advisor", CLIENT_ID, { ...FIELDS, memberId: null });
    expect(rows.inserted).toEqual([{ ...FIELDS, memberId: null, clientId: CLIENT_ID, advisorId: "advisor" }]);
  });
});

describe("noteUpdate", () => {
  it("writes the new fields to the note", async () => {
    rows.owner = [{ memberId: MEMBER_ID }];
    rows.updated = [{}];

    await expect(noteUpdate("advisor", "note-1", FIELDS)).resolves.toMatchObject({ id: "note-1", title: "Roth conversion" });
    expect(rows.sets).toEqual([FIELDS]);
  });

  it("rejects a note the advisor doesn't own", async () => {
    await expect(noteUpdate("advisor", "note-1", FIELDS)).rejects.toMatchObject({ _status: NOTE_ERRORS.NOTE_NOT_FOUND.STATUS });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a member from outside the note's client", async () => {
    rows.owner = [{ memberId: null }];

    await expect(noteUpdate("advisor", "note-1", FIELDS)).rejects.toMatchObject({ _status: NOTE_ERRORS.MEMBER_NOT_FOUND.STATUS });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("reports not found when the note is deleted before the write lands", async () => {
    rows.owner = [{ memberId: MEMBER_ID }];

    await expect(noteUpdate("advisor", "note-1", FIELDS)).rejects.toMatchObject({ _status: NOTE_ERRORS.NOTE_NOT_FOUND.STATUS });
  });
});

describe("noteDelete", () => {
  it("resolves when the note is removed", async () => {
    rows.deleted = [{ id: "note-1" }];

    await expect(noteDelete("advisor", "note-1")).resolves.toBeUndefined();
  });

  it("rejects when no note of the advisor's matched", async () => {
    await expect(noteDelete("advisor", "note-1")).rejects.toMatchObject({ _status: NOTE_ERRORS.NOTE_NOT_FOUND.STATUS });
  });
});
