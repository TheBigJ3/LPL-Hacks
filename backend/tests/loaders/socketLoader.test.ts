import { beforeEach, describe, expect, it, vi } from "vitest";

const { server, rateLimitConsume } = vi.hoisted(() => ({
  server: { attach: vi.fn(), use: vi.fn(), on: vi.fn() },
  rateLimitConsume: vi.fn(),
}));

vi.mock("socket.io", () => ({ Server: vi.fn(function () { return server; }) }));
vi.mock("@socket.io/redis-adapter", () => ({ createAdapter: vi.fn(() => "redis-adapter") }));
vi.mock("../../loaders/redisLoader.js", () => ({ redis_client: { duplicate: () => ({ on: vi.fn() }) } }));
vi.mock("../../services/rateLimit/rateLimitMethods.js", () => ({ rateLimitConsume }));

const { loadSockets } = await import("../../loaders/socketLoader.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadSockets", () => {
  it("attaches to the server over WebSocket only, with the allowed origins", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await loadSockets({} as any, ["http://localhost:5173"]);

    expect(server.attach).toHaveBeenCalledWith({}, {
      cors: { origin: ["http://localhost:5173"], credentials: true },
      transports: ["websocket"],
    });
    expect(server.on).toHaveBeenCalledWith("connection", expect.any(Function));
  });
});
