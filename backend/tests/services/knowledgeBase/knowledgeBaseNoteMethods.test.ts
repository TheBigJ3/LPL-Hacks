import { beforeEach, describe, expect, it, vi } from "vitest";

const { s3Send } = vi.hoisted(() => ({ s3Send: vi.fn() }));

vi.mock("../../../loaders/s3Loader.js", () => ({ s3_client: { send: s3Send } }));
vi.mock("../../../loaders/bedrockAgentLoader.js", () => ({ BEDROCK_KNOWLEDGE_BASE_BUCKET: "kb-bucket" }));

const { knowledgeBaseNoteRemove, knowledgeBaseNoteWrite } = await import("../../../services/knowledgeBase/knowledgeBaseNoteMethods.js");

const NOTE = {
  noteId: "note-1",
  clientId: "client-1",
  title: "Roth conversion",
  bodyText: "Wants to revisit the Roth conversion.",
  household: "Patel Family",
  member: "Priya Patel",
  familyMembers: ["member-priya"],
  date: "2026-10-03",
  time: "2:05 PM UTC",
  createdAt: "2026-10-03T14:05:00.000Z",
};

function sent(name: string) {
  return s3Send.mock.calls.map(([command]) => command).filter((command) => command.constructor.name === name).map((command) => command.input);
}

beforeEach(() => {
  vi.clearAllMocks();
  s3Send.mockResolvedValue({});
});

describe("knowledgeBaseNoteWrite", () => {
  it("writes the note's fields and citable filter metadata into the knowledge base bucket", async () => {
    await expect(knowledgeBaseNoteWrite(NOTE)).resolves.toBe("notes/note-1/note.json");

    const [body, metadata] = sent("PutObjectCommand");
    expect(body).toMatchObject({ Bucket: "kb-bucket", Key: "notes/note-1/note.json" });
    expect(JSON.parse(body!.Body)).toEqual({
      title: "Roth conversion",
      body_text: "Wants to revisit the Roth conversion.",
      household: "Patel Family",
      member: "Priya Patel",
      date: "2026-10-03",
      time: "2:05 PM UTC",
    });
    expect(metadata).toMatchObject({ Bucket: "kb-bucket", Key: "notes/note-1/note.json.metadata.json" });
    expect(JSON.parse(metadata!.Body)).toEqual({
      metadataAttributes: {
        sourceType: "note",
        documentId: "note-1",
        sectionId: "note",
        clientId: "client-1",
        fileName: "Roth conversion",
        date: "2026-10-03T14:05:00.000Z",
        familyMembers: ["member-priya"],
      },
    });
  });

  it("leaves out an empty member list, which Bedrock would reject", async () => {
    await knowledgeBaseNoteWrite({ ...NOTE, familyMembers: [] });

    const [, metadata] = sent("PutObjectCommand");
    expect(JSON.parse(metadata!.Body).metadataAttributes).not.toHaveProperty("familyMembers");
  });
});

describe("knowledgeBaseNoteRemove", () => {
  it("deletes the note and its metadata", async () => {
    await knowledgeBaseNoteRemove("note-1");

    expect(sent("DeleteObjectsCommand")).toEqual([{
      Bucket: "kb-bucket",
      Delete: { Objects: [{ Key: "notes/note-1/note.json" }, { Key: "notes/note-1/note.json.metadata.json" }], Quiet: true },
    }]);
  });
});
