import { describe, expect, it } from "vitest";
import { isForeignKeyViolation, isUniqueViolation } from "../../modules/pgError.js";

describe("isUniqueViolation", () => {
  it("reads the code off a raw driver error", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("reads the code through the error Drizzle wraps the driver's in", () => {
    const wrapped = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });

    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("ignores any other Postgres error", () => {
    expect(isUniqueViolation(Object.assign(new Error("Failed query"), { cause: { code: "23503" } }))).toBe(false);
  });

  it("ignores a value that is not an error", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  it("reads the code through the error Drizzle wraps the driver's in", () => {
    expect(isForeignKeyViolation(Object.assign(new Error("Failed query"), { cause: { code: "23503" } }))).toBe(true);
  });

  it("ignores a unique violation", () => {
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
  });
});
