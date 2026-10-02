import { beforeEach, describe, expect, it, vi } from "vitest";

const { io, broadcast } = vi.hoisted(() => {
  const broadcast = { emit: vi.fn() };

  return { broadcast, io: { to: vi.fn(() => broadcast), emit: vi.fn() } };
});

vi.mock("../../../loaders/socketLoader.js", () => ({ io }));

const { realtimeNotifyAll, realtimeNotifyRooms } = await import("../../../services/realtime/realtimeMethods.js");

const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";
const documentsExtracted = { name: "documents:extracted" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("realtimeNotifyRooms", () => {
  it("sends once to each room even when a room is listed twice", () => {
    realtimeNotifyRooms(["household:h-1", "household:h-2", "household:h-1"], documentsExtracted, { documentId: DOCUMENT_ID });

    expect(io.to).toHaveBeenCalledWith(["household:h-1", "household:h-2"]);
    expect(broadcast.emit).toHaveBeenCalledWith("documents:extracted", { documentId: DOCUMENT_ID });
  });

  it("sends nothing when no room is listed", () => {
    realtimeNotifyRooms([], documentsExtracted, { documentId: DOCUMENT_ID });

    expect(io.to).not.toHaveBeenCalled();
  });

  it("never fails the caller when the broadcast throws", () => {
    broadcast.emit.mockImplementationOnce(() => { throw new Error("adapter down"); });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => realtimeNotifyRooms(["household:h-1"], documentsExtracted, { documentId: DOCUMENT_ID })).not.toThrow();

    logged.mockRestore();
  });
});

describe("realtimeNotifyAll", () => {
  it("never fails the caller when the broadcast throws", () => {
    io.emit.mockImplementationOnce(() => { throw new Error("adapter down"); });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => realtimeNotifyAll(documentsExtracted, { documentId: DOCUMENT_ID })).not.toThrow();

    logged.mockRestore();
  });
});
