import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimitConsume } = vi.hoisted(() => ({
  rateLimitConsume: vi.fn(),
}));

vi.mock("../../services/rateLimit/rateLimitMethods.js", () => ({ rateLimitConsume }));

const { rateLimit } = await import("../../apiMiddleware/rateLimit.js");

const request = () => ({ headers: {}, ip: "203.0.113.7" }) as any;
const response = () => ({ setHeader: vi.fn() }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitConsume.mockResolvedValue({ allowed: true, remaining: 99, retryAfter: 0 });
});

describe("rateLimit", () => {
  it("charges the caller's address", async () => {
    const next = vi.fn();

    await rateLimit(3)(request(), response(), next);

    expect(rateLimitConsume).toHaveBeenCalledWith(undefined, "203.0.113.7", 3);
    expect(next).toHaveBeenCalledWith();
  });

  it("refuses with 429 and Retry-After once the bucket is empty", async () => {
    rateLimitConsume.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 4 });
    const res = response();
    const next = vi.fn();

    await rateLimit(2)(request(), res, next);

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 4);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ _statusCode: 429 }));
  });

  it("hands a limiter failure to the error handler instead of rejecting", async () => {
    const failure = new Error("connection reset");
    rateLimitConsume.mockRejectedValue(failure);
    const next = vi.fn();

    await expect(rateLimit(1)(request(), response(), next)).resolves.not.toThrow();

    expect(next).toHaveBeenCalledWith(failure);
  });
});
