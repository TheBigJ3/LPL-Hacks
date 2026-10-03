import { describe, expect, it, vi } from "vitest";
import { GENERAL_ERRORS } from "../../../../types/native/errors.js";

const { default: watch } = await import("../../../../sockets/events/documents/watch.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";

describe("documents:watch", () => {
  it("joins the document's room so its extraction signal reaches this socket", async () => {
    const socket = { join: vi.fn() };

    await expect(watch.handler({ documentId: DOCUMENT_ID }, { socket } as any)).resolves.toEqual({ success: true });
    expect(socket.join).toHaveBeenCalledWith(`document:${DOCUMENT_ID}`);
  });

  it("rejects a payload without a document id and joins nothing", async () => {
    const socket = { join: vi.fn() };

    await expect(watch.handler({ documentId: "not-an-id" }, { socket } as any)).rejects.toMatchObject({ _status: GENERAL_ERRORS.BAD_REQUEST.STATUS });
    expect(socket.join).not.toHaveBeenCalled();
  });
});
