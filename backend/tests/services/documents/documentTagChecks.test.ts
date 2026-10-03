import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_TAG_DOC_TYPE_TOPICS,
  documentTagBuildPeople,
  documentTagBuildText,
  documentTagFromDecision,
  documentTagMatchName,
} from "../../../services/documents/documentTagChecks.js";

const answer = (answerValue: boolean | null, status: string, text = "W-2 for Jess Johnson") => ({
  type: "document_noul", answer: answerValue, status, evidence: [{ id: "document", text, relevance: 1 }],
});

describe("documentTagBuildPeople", () => {
  it("asks about each household member with their name split around any middle names", () => {
    expect(documentTagBuildPeople({ id: "c1", name: "Johnson Household", kind: "household" }, [
      { id: "m1", name: "Jess Johnson" },
      { id: "m2", name: "Mary Ann Lee Johnson" },
    ])).toEqual([
      { first_name: "Jess", last_name: "Johnson", person_id: "m1", name: "Jess Johnson" },
      { first_name: "Mary", middle_name: "Ann Lee", last_name: "Johnson", person_id: "m2", name: "Mary Ann Lee Johnson" },
    ]);
  });

  it("asks about the client themselves when they're an individual", () => {
    expect(documentTagBuildPeople({ id: "c2", name: "Kenji Sato", kind: "individual" }, []))
      .toEqual([{ first_name: "Kenji", last_name: "Sato", person_id: "c2", name: "Kenji Sato" }]);
  });

  it("skips a single-word name and asks about no one without a client", () => {
    expect(documentTagBuildPeople({ id: "c1", name: "H", kind: "household" }, [{ id: "m1", name: "Jess" }])).toEqual([]);
    expect(documentTagBuildPeople(null, [])).toEqual([]);
  });
});

describe("documentTagBuildText", () => {
  it("uses the advisor's corrected values ahead of the page text, without doubling a label's colon or keeping empty fields", () => {
    const extraction = {
      fields: [
        { id: "wages", label: "Wages:", rawValue: "84,25O.00" },
        { id: "retirement", label: "Retirement plan", rawValue: null },
        { id: "blank", label: "Box 14", rawValue: "" },
      ],
      tables: [],
      lines: [{ text: "Form W-2 Wage and Tax Statement" }],
    } as any;

    expect(documentTagBuildText(extraction, { wages: { value: "84,250.00", corrected: true }, retirement: { value: true, corrected: true } }))
      .toBe("Wages: 84,250.00\nRetirement plan: checked\n\nForm W-2 Wage and Tax Statement");
  });
});

describe("documentTagBuildText corrections", () => {
  const box = (left: number, top: number) => ({ left, top, width: 0.03, height: 0.01 });
  const extraction = {
    fields: [{ id: "recipient", label: "RECIPIENT'S name", page: 1, rawValue: "DW", valueBox: box(0.09, 0.3) }],
    tables: [{ id: "t", page: 1, cells: [{ id: "cell", rawValue: "18,75O.00", box: box(0.5, 0.5) }] }],
    lines: [
      { text: "RECIPIENT'S name", page: 1, box: box(0.09, 0.28) },
      { text: "DW", page: 1, box: box(0.092, 0.3005) },
      { text: "DW", page: 2, box: box(0.09, 0.3) },
      { text: "$ 18,75O.00", page: 1, box: box(0.5, 0.5) },
    ],
  } as any;

  it("replaces a corrected value where Textract read it on the page, leaving the same text elsewhere alone", () => {
    const text = documentTagBuildText(extraction, { recipient: { value: "S.W", corrected: true }, cell: { value: "18,750.00", corrected: true } });

    expect(text.split("\n")).toEqual(["RECIPIENT'S name: S.W", "", "RECIPIENT'S name", "S.W", "DW", "$ 18,750.00"]);
  });

  it("leaves the page text as read when a value was only approved", () => {
    const text = documentTagBuildText(extraction, { recipient: { value: "DW", corrected: false } });

    expect(text.split("\n").slice(2)).toEqual(["RECIPIENT'S name", "DW", "DW", "$ 18,75O.00"]);
  });

  it("falls back to the exact line when a field has no position", () => {
    const unplaced = { ...extraction, fields: [{ ...extraction.fields[0], valueBox: null }], lines: [{ text: "DW", page: 1, box: null }, { text: "DWX", page: 1, box: null }] };

    expect(documentTagBuildText(unplaced, { recipient: { value: "S.W", corrected: true } }).split("\n").slice(2)).toEqual(["S.W", "DWX"]);
  });

  it("no longer names a member once their initials were corrected away", () => {
    const [dana] = documentTagBuildPeople({ id: "c2", name: "Dana Whitfield", kind: "individual" }, []);
    const onePage = { ...extraction, lines: extraction.lines.filter((line: { page: number }) => line.page === 1) };
    const text = documentTagBuildText(onePage, { recipient: { value: "S.W", corrected: true } });

    expect(documentTagMatchName(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), dana!)).toBeNull();
  });
});

describe("documentTagFromDecision", () => {
  const people = documentTagBuildPeople({ id: "c1", name: "Johnson Household", kind: "household" }, [
    { id: "m1", name: "Jess Johnson" },
    { id: "m2", name: "Kim Johnson" },
  ]);
  const text = "Form W-2 Wage and Tax Statement 2024\nEmployee's name: JESS JOHNSON\nWages: 84,250.00";
  const decision = {
    docType: { type: "choice", choice: "w2", evidence: [{ id: "document", text: "Form W-2" }] },
    tags: { tag_tax: answer(false, "tentative"), tag_income: answer(true, "confirmed"), tag_bonus: answer(true, "confirmed") },
    members: { member_jess_johnson: answer(true, "tentative"), member_kim_johnson: answer(true, "tentative") },
  };

  it("takes topics from the document type even when the model answers no, and adds only a confirmed model tag", () => {
    const { tagging } = documentTagFromDecision(decision, people, text, new Date("2026-10-03T12:00:00Z"));

    expect(tagging.docType).toEqual({ choice: "w2", evidence: [{ id: "document", text: "Form W-2" }] });
    expect(tagging.tags.map((tag) => [tag.name, tag.source])).toEqual([["income", "docType"], ["retirement", "docType"], ["tax", "docType"], ["bonus", "model"]]);
    expect(tagging.taggedAt).toBe("2026-10-03T12:00:00.000Z");
  });

  it("tags a member whose full name is on the document, whatever the model's confidence", () => {
    const unsure = { ...decision, members: { member_jess_johnson: answer(false, "tentative"), member_kim_johnson: answer(false, "tentative") } };

    expect(documentTagFromDecision(unsure, people, text, new Date()).tagging.members).toEqual([
      { memberId: "m1", name: "Jess Johnson", basis: "fullName", evidence: [{ id: "document", text: "W-2 for Jess Johnson" }] },
    ]);
  });

  it("never treats a member as the only candidate off another member's surname", () => {
    const unsure = { ...decision, members: { member_jess_johnson: answer(false, "tentative"), member_kim_johnson: answer(false, "tentative") } };

    expect(documentTagFromDecision(unsure, people, text, new Date()).tagging.members.map((member) => member.memberId)).toEqual(["m1"]);
  });

  it("lets a confirmed model no veto a member named in full", () => {
    const vetoed = { ...decision, members: { member_jess_johnson: answer(false, "confirmed"), member_kim_johnson: answer(false, "confirmed") } };

    expect(documentTagFromDecision(vetoed, people, text, new Date()).tagging.members).toEqual([]);
  });

  it("tags the only person on the client a partial name could mean, unless the model confirms a no", () => {
    const initials = "Employee: J. Johnson\nWages: 84,250.00";
    const unsure = { ...decision, members: { member_jess_johnson: answer(false, "tentative"), member_kim_johnson: answer(false, "tentative") } };
    const vetoed = { ...decision, members: { member_jess_johnson: answer(false, "confirmed"), member_kim_johnson: answer(false, "tentative") } };

    expect(documentTagFromDecision(unsure, people, initials, new Date()).tagging.members.map((member) => [member.memberId, member.basis])).toEqual([["m1", "onlyCandidate"]]);
    expect(documentTagFromDecision(vetoed, people, initials, new Date()).tagging.members).toEqual([]);
  });

  it("tags an individual client from initials OCR glued into one word, though the model couldn't tell", () => {
    const dana = documentTagBuildPeople({ id: "c2", name: "Dana Whitfield", kind: "individual" }, []);
    const form = { ...decision, members: { member_dana_whitfield: answer(false, "tentative") } };

    expect(documentTagFromDecision(form, dana, "RECIPIENT'S name: DW\nForm 1099-R", new Date()).tagging.members.map((member) => [member.name, member.basis]))
      .toEqual([["Dana Whitfield", "onlyCandidate"]]);
  });

  it("uses the model to pick which household member a bare surname means", () => {
    const surname = { ...decision, members: { member_jess_johnson: answer(false, "tentative"), member_kim_johnson: answer(true, "tentative") } };
    const unsure = { ...decision, members: { member_jess_johnson: answer(false, "tentative"), member_kim_johnson: answer(false, "tentative") } };

    expect(documentTagFromDecision(surname, people, "Johnson family statement", new Date()).tagging.members.map((member) => [member.memberId, member.basis])).toEqual([["m2", "partialName"]]);
    expect(documentTagFromDecision(unsure, people, "Johnson family statement", new Date()).tagging.members).toEqual([]);
  });

  it("never tags someone the document doesn't name at all, even on the model's yes", () => {
    expect(documentTagFromDecision(decision, people, "Form W-2 for an unrelated employee", new Date()).tagging.members).toEqual([]);
  });

  it("flattens every answer, raw, into the shape the knowledge base ingest reads", () => {
    const { answers } = documentTagFromDecision(decision, people, text, new Date());

    expect(Object.keys(answers)).toEqual(["docType", "tag_tax", "tag_income", "tag_bonus", "member_jess_johnson", "member_kim_johnson"]);
    expect(answers.tag_tax).toBe(decision.tags.tag_tax);
  });

  it("leaves the type and its topics empty when the model can't tell", () => {
    const { tagging } = documentTagFromDecision({ ...decision, docType: { type: "choice", choice: "unknown" } }, people, text, new Date());

    expect(tagging.docType).toBeNull();
    expect(tagging.tags.map((tag) => tag.name)).toEqual(["income", "bonus"]);
  });
});

describe("documentTagMatchName", () => {
  const [dana] = documentTagBuildPeople({ id: "c2", name: "Dana Whitfield", kind: "individual" }, []);
  const tokensOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  it.each([
    ["Dana Whitfield", "fullName"],
    ["DANA M. WHITFIELD", "fullName"],
    ["Whitfield, Dana", "fullName"],
    ["D. Whitfield", "initials"],
    ["Whitfield D", "initials"],
    ["Dana W.", "initials"],
    ["Ms. Whitfield", "oneName"],
    ["Dear Dana", "oneName"],
    ["RECIPIENT'S name: DW", "initials"],
    ["D.W.", "initials"],
    ["Recipient: Taylor Mock", null],
  ])("reads %s as %s", (text, expected) => {
    expect(documentTagMatchName(tokensOf(text), dana!)).toBe(expected);
  });
});

describe("DOCUMENT_TAG_DOC_TYPE_TOPICS", () => {
  it("matches the decision service's document type config", () => {
    const config = JSON.parse(readFileSync(new URL("../../../../opendecision-microservice/config/doc_types.json", import.meta.url), "utf8"));
    const topics = Object.fromEntries(Object.entries(config)
      .filter(([, entry]) => typeof entry === "object" && entry !== null && "topics" in entry && (entry as { topics: string[] }).topics.length > 0)
      .map(([id, entry]) => [id, (entry as { topics: string[] }).topics]));

    expect(DOCUMENT_TAG_DOC_TYPE_TOPICS).toEqual(topics);
  });
});
