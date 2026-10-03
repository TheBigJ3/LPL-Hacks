import { describe, expect, it } from "vitest";
import { clientCheckIsId, clientCheckMemberSlugs, clientCheckPickSlug, clientCheckSlugBase } from "../../../services/clients/clientChecks.js";

describe("clientCheckIsId", () => {
  it("treats a uuid as a client id", () => {
    expect(clientCheckIsId("d9338468-31af-4210-8fda-15fc72ff3faf")).toBe(true);
  });

  it("treats anything else as a slug", () => {
    expect(clientCheckIsId("johnson")).toBe(false);
    expect(clientCheckIsId("seed-johnson-family")).toBe(false);
  });
});

describe("clientCheckSlugBase", () => {
  it("lowercases, strips accents and joins words with dashes", () => {
    expect(clientCheckSlugBase("  Nuñez & O'Brien Household ", "client")).toBe("nunez-o-brien-household");
  });

  it("falls back when the name has no usable characters", () => {
    expect(clientCheckSlugBase("李 王", "client")).toBe("client");
  });

  it("caps the length without leaving a trailing dash", () => {
    const slug = clientCheckSlugBase(`${"a".repeat(59)} b`, "client");
    expect(slug).toBe("a".repeat(59));
  });
});

describe("clientCheckPickSlug", () => {
  it("keeps the base when it's free", () => {
    expect(clientCheckPickSlug("johnson", ["johnson-household"])).toBe("johnson");
  });

  it("numbers from 2 past every taken suffix", () => {
    expect(clientCheckPickSlug("johnson", ["johnson", "johnson-2", "johnson-3"])).toBe("johnson-4");
  });
});

describe("clientCheckMemberSlugs", () => {
  it("uses first names, falling back to full names and then numbers when they repeat", () => {
    expect(clientCheckMemberSlugs(["Adam Johnson", "Jess Johnson", "Adam Reed", "Adam Reed"])).toEqual(["adam", "jess", "adam-reed", "adam-reed-2"]);
  });
});
