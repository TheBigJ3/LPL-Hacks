import { PutObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../modules/AppError.js";
import { OPENDECISION_ERRORS } from "../../../types/native/opendecision/errors.js";

const { db, results, calls, s3Send, invoke, notifyRooms } = vi.hoisted(() => {
  const results: unknown[][] = [];
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = (): any => new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "then") return (resolve: (value: unknown) => void) => resolve(results.shift() ?? []);
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return chain();
      };
    },
  });
  return { db: chain(), results, calls, s3Send: vi.fn(), invoke: vi.fn(), notifyRooms: vi.fn() };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));
vi.mock("../../../loaders/s3Loader.js", () => ({ S3_DOCUMENTS_BUCKET: "documents-bucket", s3_client: { send: s3Send } }));
vi.mock("../../../services/opendecision/opendecisionMethods.js", () => ({ opendecisionInvoke: invoke }));
vi.mock("../../../services/realtime/realtimeMethods.js", () => ({ realtimeNotifyRooms: notifyRooms }));

const { documentTagRun, documentTagMarkFailed } = await import("../../../services/documents/documentTagMethods.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const CLIENT_ID = "6b0f1d3c-1f2a-4c5e-9d8b-7a6c5b4e3d21";
const REVIEWED_AT = "2026-10-03T12:00:00.000Z";
const EXTRACTION = { fields: [{ id: "wages", label: "Wages", rawValue: "84,250.00" }], tables: [], lines: [] };

const row = (overrides: Record<string, unknown> = {}) => ({
  fileName: "W-2 2024.pdf",
  extraction: EXTRACTION,
  reviewedFields: { wages: { value: "84,250.00", corrected: false } },
  reviewedAt: new Date(REVIEWED_AT),
  tagStatus: "pending",
  client: { id: CLIENT_ID, name: "Johnson Household", kind: "household" },
  member: { id: "m1", name: "Jess Johnson" },
  ...overrides,
});

const DECISION = {
  docType: { type: "choice", choice: "w2", evidence: [] },
  tags: { tag_income: { answer: true, status: "confirmed", evidence: [] } },
  members: { member_jess_johnson: { answer: true, status: "confirmed", evidence: [] } },
};

const setArgs = () => calls.filter((call) => call.method === "set").map((call) => call.args[0]);

beforeEach(() => {
  vi.clearAllMocks();
  results.length = 0;
  calls.length = 0;
});

describe("documentTagRun", () => {
  it.each([
    ["missing", []],
    ["not waiting for tagging", [row({ tagStatus: "tagged" })]],
    ["confirmed again since this job was queued", [row({ reviewedAt: new Date("2026-10-03T12:05:00Z") })]],
  ])("skips a document that is %s, without calling the model", async (_case, selected) => {
    results.push(selected);

    expect(await documentTagRun(DOCUMENT_ID, REVIEWED_AT)).toBe("skipped");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks about the household's members, stores the decision for the knowledge base, then marks it ready to index", async () => {
    results.push([row()], [{ id: DOCUMENT_ID }]);
    invoke.mockResolvedValue(DECISION);

    expect(await documentTagRun(DOCUMENT_ID, REVIEWED_AT)).toBe("tagged");
    expect(invoke).toHaveBeenCalledWith("decision", {
      document: { name: "W-2 2024.pdf", text: "Wages: 84,250.00" },
      members: [{ first_name: "Jess", last_name: "Johnson", person_id: "m1" }],
    });
    const put = s3Send.mock.calls[0]![0] as PutObjectCommand;
    expect(put.input.Key).toBe(`decisions/${CLIENT_ID}/W-2%202024.pdf.json`);
    expect(JSON.parse(put.input.Body as string)).toEqual({
      decided: { docType: "w2", tags: ["income", "retirement", "tax"], members: [] },
      answers: { docType: DECISION.docType, ...DECISION.tags, ...DECISION.members },
    });
    expect(setArgs()).toEqual([expect.objectContaining({ tagStatus: "tagged", decisionS3Key: put.input.Key, indexStatus: "pending" })]);
    expect(notifyRooms).toHaveBeenCalledWith([`document:${DOCUMENT_ID}`], expect.objectContaining({ name: "documents:tagSettled" }), { documentId: DOCUMENT_ID });
  });

  it("tags a document with no client but doesn't queue it for the knowledge base", async () => {
    results.push([row({ client: null, member: null })], [{ id: DOCUMENT_ID }]);
    invoke.mockResolvedValue({ ...DECISION, members: {} });

    expect(await documentTagRun(DOCUMENT_ID, REVIEWED_AT)).toBe("tagged");
    expect(invoke.mock.calls[0]![1].members).toEqual([]);
    expect(s3Send).not.toHaveBeenCalled();
    expect(setArgs()).toEqual([expect.objectContaining({ decisionS3Key: null, indexStatus: null })]);
  });

  it("sends no signal when the CAS finds the tagging already settled", async () => {
    results.push([row()], []);
    invoke.mockResolvedValue(DECISION);

    expect(await documentTagRun(DOCUMENT_ID, REVIEWED_AT)).toBe("tagged");
    expect(notifyRooms).not.toHaveBeenCalled();
  });

  it("rethrows a busy endpoint so the job retries", async () => {
    results.push([row()]);
    invoke.mockRejectedValue(new AppError(OPENDECISION_ERRORS.ANALYSIS_BUSY));

    await expect(documentTagRun(DOCUMENT_ID, REVIEWED_AT)).rejects.toMatchObject({ _status: OPENDECISION_ERRORS.ANALYSIS_BUSY.STATUS });
    expect(setArgs()).toEqual([]);
  });

  it("fails the tagging at once when the document is too large to ever succeed", async () => {
    results.push([row()], [{ id: DOCUMENT_ID }]);
    invoke.mockRejectedValue(new AppError(OPENDECISION_ERRORS.REQUEST_TOO_LARGE));

    expect(await documentTagRun(DOCUMENT_ID, REVIEWED_AT)).toBe("failed");
    expect(setArgs()).toEqual([{ tagStatus: "failed", tagFailureMessage: OPENDECISION_ERRORS.REQUEST_TOO_LARGE.MESSAGE }]);
  });

  it("refuses a decision in an unexpected shape", async () => {
    results.push([row()]);
    invoke.mockResolvedValue({ answers: {} });

    await expect(documentTagRun(DOCUMENT_ID, REVIEWED_AT)).rejects.toThrow();
    expect(s3Send).not.toHaveBeenCalled();
  });
});

describe("documentTagMarkFailed", () => {
  it("signals the room only when its CAS applied", async () => {
    results.push([{ id: DOCUMENT_ID }], []);

    expect(await documentTagMarkFailed(DOCUMENT_ID, REVIEWED_AT, "busy")).toBe(true);
    expect(await documentTagMarkFailed(DOCUMENT_ID, REVIEWED_AT, "busy")).toBe(false);
    expect(notifyRooms).toHaveBeenCalledTimes(1);
  });
});
