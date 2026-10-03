import { describe, expect, it } from "vitest";
import { retrievalChunkBuildFilter, retrievalChunkFromResult } from "../../../services/retrieval/retrievalChunkChecks.js";

describe("retrievalChunkBuildFilter", () => {
  it("uses a bare equals when only the client is given", () => {
    expect(retrievalChunkBuildFilter({ clientId: "h-1" })).toEqual({ equals: { key: "clientId", value: "h-1" } });
  });

  it("ands every given attribute and ors multiple tags", () => {
    expect(retrievalChunkBuildFilter({ clientId: "h-1", taxYear: 2025, familyMember: "Spouse", tags: ["Tax", "Earnings"] })).toEqual({
      andAll: [
        { equals: { key: "clientId", value: "h-1" } },
        { equals: { key: "taxYear", value: 2025 } },
        { equals: { key: "familyMember", value: "Spouse" } },
        { orAll: [{ listContains: { key: "tags", value: "Tax" } }, { listContains: { key: "tags", value: "Earnings" } }] },
      ],
    });
  });

  it("does not wrap a single tag in orAll", () => {
    expect(retrievalChunkBuildFilter({ clientId: "h-1", tags: ["Tax"] })).toEqual({
      andAll: [{ equals: { key: "clientId", value: "h-1" } }, { listContains: { key: "tags", value: "Tax" } }],
    });
  });
});

describe("retrievalChunkFromResult", () => {
  const METADATA = { documentId: "doc-1", page: 2, clientId: "h-1", tags: ["Tax", 7], taxYear: 2025 };

  it("maps a citable result", () => {
    expect(retrievalChunkFromResult({ content: { text: "body" }, score: 0.4, metadata: METADATA })).toEqual({
      text: "body",
      score: 0.4,
      citation: { documentId: "doc-1", page: 2 },
      clientId: "h-1",
      tags: ["Tax"],
      taxYear: 2025,
      familyMember: null,
    });
  });

  it.each([
    ["documentId", { ...METADATA, documentId: undefined }],
    ["page", { ...METADATA, page: "2" }],
    ["clientId", { ...METADATA, clientId: "" }],
  ])("drops a result missing %s", (_field, metadata) => {
    expect(retrievalChunkFromResult({ content: { text: "body" }, metadata })).toBeNull();
  });

  it("drops a result with no text", () => {
    expect(retrievalChunkFromResult({ content: {}, metadata: METADATA })).toBeNull();
  });
});
