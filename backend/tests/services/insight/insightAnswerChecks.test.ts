import { describe, expect, it } from "vitest";
import type { RetrievalChunk } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalChunk.js";
import {
  insightBuildHouseholdPrompt,
  insightBuildSources,
  insightBuildToolResult,
  insightCheckFabricatedToolUse,
  insightCheckNextSourceNumber,
  insightCheckSearchInput,
  insightResolveCitations,
  type InsightHousehold,
} from "../../../services/insight/insightAnswerChecks.js";

const household: InsightHousehold = {
  clientId: "client-1",
  name: "Johnson Family",
  kind: "household",
  members: [{ id: "member-adam", name: "Adam Johnson" }, { id: "member-jess", name: "Jess Johnson" }],
};

const chunk = (overrides: Partial<RetrievalChunk> = {}): RetrievalChunk => ({
  text: [
    "Document: adam_w2.pdf",
    "Fields:",
    "- Wages: $ 148,250.00 [verified]",
    "- Federal income tax withheld: 27,410.33 [unverified, 81% confidence]",
  ].join("\n"),
  score: 0.8,
  citation: { documentId: "doc-1", sectionId: "page-1", page: 1 },
  sourceType: "document",
  clientId: "client-1",
  fileName: "adam_w2.pdf",
  docType: "w2",
  tags: ["income"],
  familyMembers: ["member-adam"],
  taxYear: 2025,
  date: null,
  ...overrides,
});

describe("insightCheckSearchInput", () => {
  it("always searches the conversation's own client, whatever the model asks for", () => {
    const search = insightCheckSearchInput(household, { query: "wages", clientId: "someone-else" });

    expect(search).toEqual({ query: "wages", filters: { clientId: "client-1" } });
  });

  it("keeps only member ids that belong to the household", () => {
    const search = insightCheckSearchInput(household, { query: "wages", memberIds: ["member-adam", "member-of-another-client"] });

    expect(search!.filters.familyMembers).toEqual(["member-adam"]);
  });

  it("drops a member filter that names nobody in the household instead of searching for no one", () => {
    expect(insightCheckSearchInput(household, { query: "wages", memberIds: ["stranger"] })!.filters.familyMembers).toBeUndefined();
  });

  it("passes year, known form type and source type through, and ignores an unknown form type", () => {
    expect(insightCheckSearchInput(household, { query: "q", taxYear: 2025, docType: "w2", sourceType: "note" })!.filters)
      .toEqual({ clientId: "client-1", taxYear: 2025, docType: "w2", sourceType: "note" });
    expect(insightCheckSearchInput(household, { query: "q", docType: "passport" })!.filters.docType).toBeUndefined();
  });

  it("rejects input without a query", () => {
    expect(insightCheckSearchInput(household, { memberIds: ["member-adam"] })).toBeNull();
    expect(insightCheckSearchInput(household, null)).toBeNull();
  });
});

describe("insightBuildHouseholdPrompt", () => {
  it("lists each member with their id", () => {
    expect(insightBuildHouseholdPrompt(household, "2026-10-03")).toBe([
      "Household overview (today is 2026-10-03):",
      "Client: Johnson Family (household)",
      "Members:",
      "- Adam Johnson: member id member-adam",
      "- Jess Johnson: member id member-jess",
    ].join("\n"));
  });

  it("uses the client itself as the one member of an individual client", () => {
    expect(insightBuildHouseholdPrompt({ ...household, kind: "individual", name: "Dana Whitfield", members: [] }, "2026-10-03"))
      .toContain("- Dana Whitfield: member id client-1");
  });
});

describe("insightBuildSources and insightBuildToolResult", () => {
  it("numbers sources from where the conversation left off and shows member names to the model", () => {
    const sources = insightBuildSources([chunk()], 4, 600);
    const result = insightBuildToolResult(household, [chunk()], sources);

    expect(sources[0]).toMatchObject({ sourceId: "S4", documentId: "doc-1", page: 1, fileName: "adam_w2.pdf" });
    expect(result).toContain('<source id="S4" type="document" file="adam_w2.pdf" docType="w2" taxYear="2025" page="1" members="Adam Johnson">');
  });

  it("tells the model when nothing matched", () => {
    expect(insightBuildToolResult(household, [], [])).toMatch(/^No matching records/);
  });

  it("continues numbering after the highest id used so far", () => {
    expect(insightCheckNextSourceNumber(insightBuildSources([chunk(), chunk()], 7, 600))).toBe(9);
    expect(insightCheckNextSourceNumber([])).toBe(1);
  });
});

describe("insightResolveCitations", () => {
  const sources = insightBuildSources([chunk()], 1, 600);

  it("returns the cited sources and drops markers for ids no search returned", () => {
    const resolved = insightResolveCitations("Adam earned $148,250.00 [S1]. He also won the lottery [S9].", sources);

    expect(resolved.text).toBe("Adam earned $148,250.00 [S1]. He also won the lottery.");
    expect(resolved.citations.map((citation) => citation.sourceId)).toEqual(["S1"]);
    expect(resolved.citations[0]).not.toHaveProperty("fields");
  });

  it("splits grouped markers into one per source", () => {
    expect(insightResolveCitations("Total [S1, S9].", sources).text).toBe("Total [S1].");
  });

  it("marks a citation verified when every field value the answer quotes was verified", () => {
    expect(insightResolveCitations("Wages were $148,250.00 [S1].", sources).citations[0]!.verified).toBe(true);
  });

  it("marks it unverified when a quoted value was not verified", () => {
    expect(insightResolveCitations("Withholding was $27,410.33 [S1].", sources).citations[0]!.verified).toBe(false);
  });

  it("falls back to every field on the excerpt when the answer quotes none of them", () => {
    expect(insightResolveCitations("Adam has a W-2 on file [S1].", sources).citations[0]!.verified).toBe(false);
  });

  it("never marks a note verified", () => {
    const note = insightBuildSources([chunk({ sourceType: "note", text: "Adam is retiring next year." })], 1, 600);
    expect(insightResolveCitations("Adam plans to retire [S1].", note).citations[0]!.verified).toBe(false);
  });
});

describe("insightCheckFabricatedToolUse", () => {
  it("catches tool calls written out as text", () => {
    expect(insightCheckFabricatedToolUse("<tool_call>\n{\"name\": \"search_client_records\"}\n</tool_call>")).toBe(true);
    expect(insightCheckFabricatedToolUse("[{\"tool_name\": \"search_client_records\"}]")).toBe(true);
  });

  it("leaves an ordinary answer alone", () => {
    expect(insightCheckFabricatedToolUse("Adam earned $148,250.00 [S1].")).toBe(false);
  });
});
