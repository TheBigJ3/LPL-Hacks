import { describe, expect, it, vi } from "vitest";

const { currentUser } = await import("../../apiMiddleware/currentUser.js");

describe("currentUser", () => {
  it("attaches the default advisor from env to the request", () => {
    const req = {} as any;
    const next = vi.fn();

    currentUser(req, {} as any, next);

    expect(req.user).toEqual({
      userId: "00000000-0000-4000-8000-000000000001",
      firstName: "Demo",
      lastName: "Advisor",
      email: "demo.advisor@example.com",
      role: "advisor",
    });
    expect(next).toHaveBeenCalledWith();
  });
});
