import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../modules/AppError.js";
import { NOTE_ERRORS } from "../../../../types/native/notes/errors.js";

const { noteDelete, indexProducer } = vi.hoisted(() => ({ noteDelete: vi.fn(), indexProducer: vi.fn() }));

vi.mock("../../../../services/notes/noteMethods.js", () => ({ noteDelete }));
vi.mock("../../../../mq/jobs/notes/noteIndex.js", () => ({ default: { producer: indexProducer } }));

const { default: remove } = await import("../../../../api/v1/notes/delete.js");

const NOTE_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";

const request = (body: unknown) => ({ body, user: { userId: "advisor" } }) as any;

let audit: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  audit = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("delete", () => {
  it("logs the deletion and queues its removal from the knowledge base once the note is gone", async () => {
    noteDelete.mockResolvedValue(undefined);

    await expect(remove.handler(request({ noteId: NOTE_ID }), {} as any)).resolves.toEqual({ success: true });
    expect(noteDelete).toHaveBeenCalledWith("advisor", NOTE_ID);
    expect(audit).toHaveBeenCalledWith(`[audit] advisor deleted note ${NOTE_ID}`);
    expect(indexProducer).toHaveBeenCalledWith({ noteId: NOTE_ID, requestedAt: expect.any(Number) });
    expect(noteDelete.mock.invocationCallOrder[0]).toBeLessThan(indexProducer.mock.invocationCallOrder[0]!);
  });

  it("logs and queues nothing when the note wasn't found", async () => {
    noteDelete.mockRejectedValue(new AppError(NOTE_ERRORS.NOTE_NOT_FOUND));

    await expect(remove.handler(request({ noteId: NOTE_ID }), {} as any)).rejects.toMatchObject({ _status: NOTE_ERRORS.NOTE_NOT_FOUND.STATUS });
    expect(audit).not.toHaveBeenCalled();
    expect(indexProducer).not.toHaveBeenCalled();
  });
});
