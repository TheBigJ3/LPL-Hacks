import { describe, expect, it } from "vitest";
import { clientCheckIsId } from "../../../services/clients/clientChecks.js";

describe("clientCheckIsId", () => {
  it("treats a uuid as a client id", () => {
    expect(clientCheckIsId("d9338468-31af-4210-8fda-15fc72ff3faf")).toBe(true);
  });

  it("treats anything else as a slug", () => {
    expect(clientCheckIsId("johnson")).toBe(false);
    expect(clientCheckIsId("seed-johnson-family")).toBe(false);
  });
});
