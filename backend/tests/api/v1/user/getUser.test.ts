import { describe, expect, it } from "vitest";

const { default: getUser } = await import("../../../../api/v1/user/getUser.js");

const USER = {
  userId: "00000000-0000-4000-8000-000000000001",
  firstName: "Demo",
  lastName: "Advisor",
  email: "demo.advisor@example.com",
  role: "advisor" as const,
};

describe("getUser", () => {
  it("returns the request's user in the envelope", async () => {
    await expect(getUser.handler({ user: USER } as any, {} as any)).resolves.toEqual({ success: true, userData: USER });
  });
});
