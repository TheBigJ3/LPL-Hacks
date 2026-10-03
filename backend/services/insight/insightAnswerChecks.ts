import { z } from "zod";
import type { ClientKind } from "@lpl-hacks/shared/src/types/native/clients/client.js";
import type { InsightCitation, InsightSource, InsightSourceField } from "@lpl-hacks/shared/src/types/native/insight/insightMessage.js";
import type { RetrievalChunk } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalChunk.js";
import type { RetrievalFilter } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalFilter.js";

export type InsightHousehold = {
  clientId: string;
  name: string;
  kind: ClientKind;
  members: { id: string; name: string }[];
};

export type InsightSearch = {
  query: string;
  filters: RetrievalFilter;
};

export const INSIGHT_SEARCH_TOOL_NAME = "search_client_records";

// A plain name only matches built-in tools, so this pattern is what admits the inline tool while keeping shell and file access out.
export const INSIGHT_ALLOWED_TOOLS = [`@*/${INSIGHT_SEARCH_TOOL_NAME}`];

const INSIGHT_DOC_TYPES = ["w2", "1099_int", "1099_r", "1099_div", "1099_nec", "1040", "1098", "5498_sa", "1095", "account_statement"];

export const INSIGHT_SEARCH_TOOL_DESCRIPTION = [
  "Search the current household's documents and the advisor's own notes.",
  "Returns numbered excerpts (S1, S2, ...) with each source's file, type, tax year, page and the people it concerns.",
  "The search is always limited to the current household.",
].join(" ");

export const INSIGHT_SEARCH_TOOL_SCHEMA = {
  type: "object",
  properties: {
    query: { type: "string", description: "What to look for, in plain words (e.g. \"2025 wages\", \"HSA contributions\")." },
    memberIds: { type: "array", items: { type: "string" }, description: "Member ids from the household overview, to limit the search to records about those people." },
    taxYear: { type: "integer", description: "Only when the question names or clearly implies a tax or calendar year." },
    docType: { type: "string", enum: INSIGHT_DOC_TYPES, description: "Only when the question is clearly about one kind of form." },
    sourceType: { type: "string", enum: ["document", "note"], description: "Only when the question is clearly about documents alone or the advisor's notes alone." },
  },
  required: ["query"],
};

export const INSIGHT_SYSTEM_PROMPT = [
  "You assist a financial advisor by answering questions about one client household, using only that household's records, which you reach with the search_client_records tool.",
  "",
  "How to answer:",
  "- Search before answering any question about the household. If the results don't contain the answer, search again with a different query or filters. Never answer household questions from memory or outside knowledge.",
  "- To focus a search on a person, pass their member id from the household overview. Resolve nicknames, initials and partial names to a member yourself. Pass taxYear or docType only when the question names or clearly implies them.",
  "- Cite every household fact, figure and claim with its source id in square brackets right after it, like \"Adam's 2025 wages were $148,250.00 [S3].\" Only cite ids that a search returned. A sentence with no citation must not state household facts.",
  "- Each document field is marked [verified], [corrected by advisor] or [unverified, NN% confidence]. When you state a value marked unverified, say that it is unverified.",
  "- A source with type=\"note\" is the advisor's own note, not document data. Attribute it as their note (\"you noted on <date> that ...\") and never present a figure from a note as if it came from a document.",
  "- Compute totals or differences only from cited values, and cite every value you use.",
  "- If the records don't contain the answer, say plainly what is missing. Never guess or fill in numbers.",
  "- Don't narrate your searches or say what you're about to do. Write only the answer.",
  "- Be concise: lead with the answer, then the supporting detail. Use short paragraphs or a short bullet list, no headings.",
].join("\n");

const INSIGHT_CITATION_PATTERN = /\[(S\d+(?:\s*,\s*S\d+)*)\]/g;

const SearchInputZod = z.object({
  query: z.string().trim().min(1).max(500),
  memberIds: z.array(z.string()).optional(),
  taxYear: z.number().int().min(1900).max(2100).optional(),
  docType: z.string().optional(),
  sourceType: z.enum(["document", "note"]).optional(),
});

export function insightBuildHouseholdPrompt(household: InsightHousehold, today: string): string {
  const people = household.kind === "individual" ? [{ id: household.clientId, name: household.name }] : household.members;

  return [
    `Household overview (today is ${today}):`,
    `Client: ${household.name} (${household.kind})`,
    "Members:",
    ...people.map((person) => `- ${person.name}: member id ${person.id}`),
  ].join("\n");
}

function insightHouseholdPeople(household: InsightHousehold): Map<string, string> {
  const people = household.kind === "individual" ? [{ id: household.clientId, name: household.name }] : household.members;
  return new Map(people.map((person) => [person.id, person.name]));
}

// The household always comes from the conversation, never from the model, so a search can't reach another client's records.
export function insightCheckSearchInput(household: InsightHousehold, toolInput: unknown): InsightSearch | null {
  const parsed = SearchInputZod.safeParse(toolInput);
  if (!parsed.success) return null;

  const people = insightHouseholdPeople(household);
  const memberIds = (parsed.data.memberIds ?? []).filter((id) => people.has(id));
  const filters: RetrievalFilter = { clientId: household.clientId };

  if (memberIds.length > 0) filters.familyMembers = memberIds;
  if (parsed.data.taxYear !== undefined) filters.taxYear = parsed.data.taxYear;
  if (parsed.data.docType !== undefined && INSIGHT_DOC_TYPES.includes(parsed.data.docType)) filters.docType = parsed.data.docType;
  if (parsed.data.sourceType !== undefined) filters.sourceType = parsed.data.sourceType;

  return { query: parsed.data.query, filters };
}

const INSIGHT_FIELD_LINE = /^- .+?: (.+) \[(verified|corrected by advisor|unverified[^\]]*)\]$/gm;

export function insightCheckFields(chunk: RetrievalChunk): InsightSourceField[] {
  if (chunk.sourceType !== "document") return [];
  return [...chunk.text.matchAll(INSIGHT_FIELD_LINE)].map((match) => ({ value: match[1]!.trim(), verified: !match[2]!.startsWith("unverified") }));
}

function insightNormalizeValue(text: string): string {
  return text.toLowerCase().replace(/[$,\s]/g, "");
}

// Only amounts count as quoted: form names and ids also contain digits, and matching "5498-SA" in the prose isn't quoting a value.
function insightCheckAmount(normalized: string): boolean {
  return /^-?\d+(\.\d+)?%?$/.test(normalized) && normalized.replace(/\D/g, "").length >= 2;
}

// Verified when every amount the answer quotes was confirmed by the advisor; with no quoted amount, every field on the excerpt must be.
export function insightCheckVerified(source: InsightSource, answer: string): boolean {
  const fields = source.fields ?? [];
  if (fields.length === 0) return false;
  const normalized = insightNormalizeValue(answer);
  const quoted = fields.filter((field) => {
    const value = insightNormalizeValue(field.value);
    return insightCheckAmount(value) && normalized.includes(value);
  });
  return (quoted.length > 0 ? quoted : fields).every((field) => field.verified);
}

function insightCheckQuote(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars).trimEnd()}…` : trimmed;
}

export function insightBuildSources(chunks: RetrievalChunk[], firstNumber: number, quoteMaxChars: number): InsightSource[] {
  return chunks.map((chunk, index) => ({
    sourceId: `S${firstNumber + index}`,
    sourceType: chunk.sourceType,
    documentId: chunk.citation.documentId,
    page: chunk.citation.page,
    fileName: chunk.fileName,
    quote: insightCheckQuote(chunk.text, quoteMaxChars),
    verified: false,
    fields: insightCheckFields(chunk),
  }));
}

function insightAttribute(value: string | number | null): string {
  return String(value ?? "unknown").replace(/"/g, "'");
}

export function insightBuildToolResult(household: InsightHousehold, chunks: RetrievalChunk[], sources: InsightSource[]): string {
  if (chunks.length === 0) return "No matching records were found for this search. Try a broader query or fewer filters.";

  const people = insightHouseholdPeople(household);

  return chunks.map((chunk, index) => {
    const source = sources[index]!;
    const members = chunk.familyMembers.map((id) => people.get(id) ?? id).join(", ") || "none tagged";
    const attributes = chunk.sourceType === "note"
      ? `id="${source.sourceId}" type="note" title="${insightAttribute(chunk.fileName)}" date="${insightAttribute(chunk.date)}" members="${insightAttribute(members)}"`
      : `id="${source.sourceId}" type="document" file="${insightAttribute(chunk.fileName)}" docType="${insightAttribute(chunk.docType)}" taxYear="${insightAttribute(chunk.taxYear)}" page="${insightAttribute(chunk.citation.page)}" members="${insightAttribute(members)}"`;
    return `<source ${attributes}>\n${chunk.text.trim()}\n</source>`;
  }).join("\n\n");
}

export function insightCheckNextSourceNumber(sources: InsightSource[]): number {
  return sources.reduce((highest, source) => Math.max(highest, Number(source.sourceId.slice(1)) || 0), 0) + 1;
}

// Markers for ids no search returned are invented, so they're dropped from the text rather than shown as citations.
export function insightResolveCitations(text: string, known: InsightSource[]): { text: string; citations: InsightCitation[] } {
  const byId = new Map(known.map((source) => [source.sourceId, source]));
  const cited = new Map<string, InsightSource>();

  const resolved = text.replace(INSIGHT_CITATION_PATTERN, (_match, ids: string) => {
    const valid = ids.split(",").map((id) => id.trim()).filter((id) => byId.has(id));
    for (const id of valid) cited.set(id, byId.get(id)!);
    return valid.map((id) => `[${id}]`).join("");
  }).replace(/[ \t]+([.,;:!?])/g, "$1").trim();

  const citations = [...cited.values()].map(({ fields, ...citation }) => ({ ...citation, verified: insightCheckVerified({ ...citation, fields }, resolved) }));
  return { text: resolved, citations };
}

// A model that can't see the tool writes the call and its "results" as text, which would put invented figures in front of the advisor.
export function insightCheckFabricatedToolUse(text: string): boolean {
  return /<\/?tool_(call|response|use|result)>|"tool_(name|call_id|input)"\s*:/.test(text);
}
