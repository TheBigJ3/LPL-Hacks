import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERRORS } from "../../../types/native/clients/errors.js";

const { db, results, calls } = vi.hoisted(() => {
  const results: unknown[] = [];
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = (): any => new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "then") {
        return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
          const next = results.shift() ?? [];
          return next instanceof Error ? reject(next) : resolve(next);
        };
      }
      if (prop === "transaction") return (run: (tx: unknown) => Promise<unknown>) => run(chain());
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return chain();
      };
    },
  });
  return { db: chain(), results, calls };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));

const valuesArgs = () => calls.filter((call) => call.method === "values").map((call) => call.args[0]);

beforeEach(() => {
  results.length = 0;
  calls.length = 0;
});

const { clientCreate, clientList, clientResolve } = await import("../../../services/clients/clientMethods.js");

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

describe("clientCreate", () => {
  it("creates a household under the next free slug with its members slugged by first name", async () => {
    results.push(
      [{ slug: "johnson-household" }, { slug: "johnson-household-2" }],
      [{ id: "c1", slug: "johnson-household-3", name: "Johnson Household", kind: "household" }],
      [{ id: "m2", slug: "jess", name: "Jess Johnson" }, { id: "m1", slug: "adam", name: "Adam Johnson" }],
    );

    await expect(clientCreate("advisor", {
      kind: "household",
      name: "Johnson Household",
      members: [{ name: "Jess Johnson" }, { name: "Adam Johnson" }],
    })).resolves.toEqual({
      id: "c1",
      slug: "johnson-household-3",
      name: "Johnson Household",
      kind: "household",
      members: [{ id: "m1", slug: "adam", name: "Adam Johnson" }, { id: "m2", slug: "jess", name: "Jess Johnson" }],
    });
    expect(valuesArgs()).toEqual([
      { advisorId: "advisor", slug: "johnson-household-3", name: "Johnson Household", kind: "household" },
      [{ clientId: "c1", slug: "jess", name: "Jess Johnson" }, { clientId: "c1", slug: "adam", name: "Adam Johnson" }],
    ]);
  });

  it("creates an individual without inserting any members", async () => {
    results.push([], [{ id: "c2", slug: "dana-whitfield", name: "Dana Whitfield", kind: "individual" }]);

    await expect(clientCreate("advisor", { kind: "individual", name: "Dana Whitfield" })).resolves.toEqual({
      id: "c2", slug: "dana-whitfield", name: "Dana Whitfield", kind: "individual", members: [],
    });
    expect(valuesArgs()).toHaveLength(1);
  });

  it("reports a conflict when another request took the slug first", async () => {
    results.push([], Object.assign(new Error("duplicate key"), { code: "23505" }));

    await expect(clientCreate("advisor", { kind: "individual", name: "Dana Whitfield" }))
      .rejects.toMatchObject({ _status: CLIENT_ERRORS.CLIENT_NAME_CONFLICT.STATUS });
  });
});
