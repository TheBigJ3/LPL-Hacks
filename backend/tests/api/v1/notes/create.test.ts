import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../modules/AppError.js";
import { CLIENT_ERRORS } from "../../../../types/native/clients/errors.js";

const { noteCreate, indexProducer } = vi.hoisted(() => ({ noteCreate: vi.fn(), indexProducer: vi.fn() }));

vi.mock("../../../../services/notes/noteMethods.js", () => ({ noteCreate }));
vi.mock("../../../../mq/jobs/notes/noteIndex.js", () => ({ default: { producer: indexProducer } }));

const { default: create } = await import("../../../../api/v1/notes/create.js");

const CLIENT_ID = "6a1f7c3e-2b4d-4e8f-9a0b-1c2d3e4f5a6b";
const FIELDS = { memberId: null, title: "Roth conversion", html: "<p>Revisit</p>", text: "Revisit", color: "mint" };

const request = (body: unknown) => ({ body, user: { userId: "advisor" } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create", () => {
  it("saves the note and only then queues it for the knowledge base", async () => {
    noteCreate.mockResolvedValue({ id: "note-1" });

    await expect(create.handler(request({ clientId: CLIENT_ID, ...FIELDS }), {} as any)).resolves.toEqual({ success: true, note: { id: "note-1" } });
    expect(noteCreate).toHaveBeenCalledWith("advisor", CLIENT_ID, FIELDS);
    expect(indexProducer).toHaveBeenCalledWith({ noteId: "note-1", requestedAt: expect.any(Number) });
    expect(noteCreate.mock.invocationCallOrder[0]).toBeLessThan(indexProducer.mock.invocationCallOrder[0]!);
  });

  it("queues nothing when the save is rejected", async () => {
    noteCreate.mockRejectedValue(new AppError(CLIENT_ERRORS.CLIENT_NOT_FOUND));

    await expect(create.handler(request({ clientId: CLIENT_ID, ...FIELDS }), {} as any)).rejects.toMatchObject({ _status: CLIENT_ERRORS.CLIENT_NOT_FOUND.STATUS });
    expect(indexProducer).not.toHaveBeenCalled();
  });
});
