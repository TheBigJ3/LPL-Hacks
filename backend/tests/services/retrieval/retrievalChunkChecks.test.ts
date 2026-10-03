import { describe, expect, it } from "vitest";
import { retrievalChunkBuildFilter, retrievalChunkFromResult } from "../../../services/retrieval/retrievalChunkChecks.js";

describe("retrievalChunkBuildFilter", () => {
  it("uses a bare equals when only the client is given", () => {
    expect(retrievalChunkBuildFilter({ clientId: "h-1" })).toEqual({ equals: { key: "clientId", value: "h-1" } });
  });

  it("ands every given attribute and ors multiple values of a list attribute", () => {
    expect(retrievalChunkBuildFilter({ clientId: "h-1", taxYear: 2025, docType: "w2", tags: ["tag_tax"], familyMembers: ["member_a", "member_b"] })).toEqual({
      andAll: [
        { equals: { key: "clientId", value: "h-1" } },
        { equals: { key: "taxYear", value: 2025 } },
        { equals: { key: "docType", value: "w2" } },
        { listContains: { key: "tags", value: "tag_tax" } },
        { orAll: [{ listContains: { key: "familyMembers", value: "member_a" } }, { listContains: { key: "familyMembers", value: "member_b" } }] },
      ],
    });
  });
});

describe("retrievalChunkFromResult", () => {
  const METADATA = { documentId: "doc-1", sectionId: "document", clientId: "h-1", fileName: "w2.pdf", docType: "w2", tags: ["tag_tax", 7], familyMembers: ["member_a"], taxYear: 2025 };

  it("maps a citable result, with no page when none was stored", () => {
    expect(retrievalChunkFromResult({ content: { text: "body" }, score: 0.4, metadata: METADATA })).toEqual({
      text: "body",
      score: 0.4,
      citation: { documentId: "doc-1", sectionId: "document", page: null },
      clientId: "h-1",
      fileName: "w2.pdf",
      docType: "w2",
      tags: ["tag_tax"],
      familyMembers: ["member_a"],
      taxYear: 2025,
    });
  });

  it.each([
    ["documentId", { ...METADATA, documentId: undefined }],
    ["sectionId", { ...METADATA, sectionId: "" }],
    ["clientId", { ...METADATA, clientId: 3 }],
  ])("drops a result missing %s", (_field, metadata) => {
    expect(retrievalChunkFromResult({ content: { text: "body" }, metadata })).toBeNull();
  });

  it("drops a result with no text", () => {
    expect(retrievalChunkFromResult({ content: {}, metadata: METADATA })).toBeNull();
  });
});
