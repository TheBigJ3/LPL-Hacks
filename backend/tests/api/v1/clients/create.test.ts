import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENERAL_ERRORS } from "../../../../types/native/errors.js";

const { clientCreate } = vi.hoisted(() => ({ clientCreate: vi.fn() }));

vi.mock("../../../../services/clients/clientMethods.js", () => ({ clientCreate }));

const { default: create } = await import("../../../../api/v1/clients/create.js");

const request = (body: unknown) => ({ body, user: { userId: "advisor" } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("create", () => {
  it("onboards a household with its trimmed member names", async () => {
    const client = { id: "c1", slug: "reed-household", name: "Reed Household", kind: "household", members: [{ id: "m1", slug: "marcus", name: "Marcus Reed" }] };
    clientCreate.mockResolvedValue(client);

    await expect(create.handler(request({ kind: "household", name: " Reed Household ", members: [{ name: " Marcus Reed " }] }), {} as any))
      .resolves.toEqual({ success: true, client });
    expect(clientCreate).toHaveBeenCalledWith("advisor", { kind: "household", name: "Reed Household", members: [{ name: "Marcus Reed" }] });
  });

  it.each([
    ["an individual with only one name", { kind: "individual", name: "Cher" }],
    ["a household member with only one name", { kind: "household", name: "Reed Household", members: [{ name: "Marcus" }] }],
    ["a household with no members", { kind: "household", name: "Reed Household", members: [] }],
  ])("rejects %s before creating anything", async (_case, body) => {
    await expect(create.handler(request(body), {} as any)).rejects.toMatchObject({ _status: GENERAL_ERRORS.BAD_REQUEST.STATUS });
    expect(clientCreate).not.toHaveBeenCalled();
  });
});
