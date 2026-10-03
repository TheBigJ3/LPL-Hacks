import { describe, expect, it, vi } from "vitest";

const { db, results } = vi.hoisted(() => {
  const results: unknown[][] = [];
  const chain = (): any => new Proxy({}, {
    get: (_target, prop) => prop === "then"
      ? (resolve: (value: unknown) => void) => resolve(results.shift() ?? [])
      : () => chain(),
  });
  return { db: chain(), results };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));

const { clientList, clientResolve } = await import("../../../services/clients/clientMethods.js");

describe("clientList", () => {
  it("folds the joined member rows into each client and keeps individuals with no members", async () => {
    results.push([
      { id: "c1", slug: "johnson", name: "Johnson Household", kind: "household", member: { id: "m1", slug: "adam", name: "Adam Johnson" } },
      { id: "c1", slug: "johnson", name: "Johnson Household", kind: "household", member: { id: "m2", slug: "jess", name: "Jess Johnson" } },
      { id: "c2", slug: "kenji-sato", name: "Kenji Sato", kind: "individual", member: null },
    ]);

    await expect(clientList("advisor")).resolves.toEqual([
      {
        id: "c1",
        slug: "johnson",
        name: "Johnson Household",
        kind: "household",
        members: [{ id: "m1", slug: "adam", name: "Adam Johnson" }, { id: "m2", slug: "jess", name: "Jess Johnson" }],
      },
      { id: "c2", slug: "kenji-sato", name: "Kenji Sato", kind: "individual", members: [] },
    ]);
  });
});

describe("clientResolve", () => {
  it("returns the matching client with its members", async () => {
    results.push([
      { id: "c1", slug: "johnson", name: "Johnson Household", kind: "household", member: { id: "m1", slug: "adam", name: "Adam Johnson" } },
    ]);

    await expect(clientResolve("advisor", "johnson")).resolves.toEqual({
      id: "c1",
      slug: "johnson",
      name: "Johnson Household",
      kind: "household",
      members: [{ id: "m1", slug: "adam", name: "Adam Johnson" }],
    });
  });

  it("throws CLIENT_NOT_FOUND when no client matches for the advisor", async () => {
    results.push([]);

    await expect(clientResolve("advisor", "seed-johnson-family")).rejects.toMatchObject({ _statusCode: 404, _status: "NOT_FOUND" });
  });
});
