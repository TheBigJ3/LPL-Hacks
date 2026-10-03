import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../modules/AppError.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import { DOCUMENT_ERRORS } from "../../../types/native/documents/errors.js";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";

const { db, rows, analyze, notifyRooms } = vi.hoisted(() => {
  const rows = { selected: [] as unknown[], updated: [] as unknown[], sets: [] as unknown[], inserted: [] as unknown[] };

  const db = {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => rows.selected }) }) })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        rows.sets.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => rows.updated }) };
      },
    })),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => {
        rows.inserted.push(values);
        return { returning: async () => [{ id: "new-document-id", ...values, status: "uploaded", pageCount: null, failureMessage: null }] };
      },
    })),
  };

  return { db, rows, analyze: vi.fn(), notifyRooms: vi.fn() };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));
vi.mock("../../../services/extraction/extractedFieldMethods.js", () => ({
  extractedFieldAnalyze: analyze,
}));
vi.mock("../../../services/realtime/realtimeMethods.js", () => ({ realtimeNotifyRooms: notifyRooms }));

const {
  documentCreate,
  documentExtract,
  documentGet,
  documentMarkFailed,
} = await import("../../../services/documents/documentMethods.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const CONTENT = Buffer.from("%PDF");
const ANALYSIS = { fields: [], tables: [], lines: [{ text: "Page one", confidence: 99, confidenceLevel: "high", page: 1, box: null }] };

const record = (overrides: Record<string, unknown> = {}) => ({
  id: DOCUMENT_ID,
  fileName: "statement.pdf",
  contentType: "application/pdf",
  content: CONTENT,
  status: "uploaded",
  pageCount: null,
  extraction: null,
  failureMessage: null,
  ...overrides,
});

const expectSettledSignal = () => expect(notifyRooms).toHaveBeenCalledWith(
  [`document:${DOCUMENT_ID}`],
  expect.objectContaining({ name: "documents:extractionSettled" }),
  { documentId: DOCUMENT_ID },
);

beforeEach(() => {
  vi.clearAllMocks();
  rows.selected = [];
  rows.updated = [];
  rows.sets = [];
  rows.inserted = [];
});

describe("documentCreate", () => {
  it("stores the whole upload on the new document and returns it without the file", async () => {
    const document = await documentCreate({ fileName: "statement.pdf", contentType: "application/pdf", contentLength: 8, body: Readable.from(["%PDF", "-1.7"]) });

    expect(rows.inserted).toEqual([{ fileName: "statement.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.7") }]);
    expect(document).toEqual({ id: "new-document-id", fileName: "statement.pdf", status: "uploaded", pageCount: null, failureMessage: null });
  });

  it.each([
    ["longer", "%PDF-1.7", GENERAL_ERRORS.UPLOAD_TOO_LARGE],
    ["shorter", "%P", GENERAL_ERRORS.BAD_REQUEST],
  ])("records nothing when the body is %s than declared", async (_case, body, expected) => {
    await expect(documentCreate({ fileName: "a.pdf", contentType: "application/pdf", contentLength: 4, body: Readable.from([body]) }))
      .rejects.toMatchObject({ _status: expected.STATUS });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("documentGet", () => {
  it("throws the not-found AppError for an unknown id", async () => {
    await expect(documentGet(DOCUMENT_ID)).rejects.toMatchObject({ _status: DOCUMENT_ERRORS.DOCUMENT_NOT_FOUND.STATUS });
  });

  it("returns the document with its extraction once there is one", async () => {
    rows.selected = [record({ status: "extracted", pageCount: 3, extraction: ANALYSIS })];

    expect(await documentGet(DOCUMENT_ID)).toEqual({
      document: { id: DOCUMENT_ID, fileName: "statement.pdf", status: "extracted", pageCount: 3, failureMessage: null },
      extraction: ANALYSIS,
    });
  });
});

describe("documentExtract", () => {
  it.each([["missing", []], ["extracted", [record({ status: "extracted" })]], ["failed", [record({ status: "failed" })]]])(
    "does nothing for a %s document",
    async (_case, selected) => {
      rows.selected = selected;

      expect(await documentExtract(DOCUMENT_ID)).toBe("skipped");
      expect(analyze).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it("analyzes the stored file, then saves the analysis and page count and signals the document's room", async () => {
    rows.selected = [record()];
    rows.updated = [{ id: DOCUMENT_ID }];
    analyze.mockResolvedValue({ pageCount: 3, analysis: ANALYSIS });

    expect(await documentExtract(DOCUMENT_ID)).toBe("extracted");
    expect(analyze).toHaveBeenCalledWith(CONTENT, "application/pdf");
    expect(rows.sets).toEqual([{ status: "extracting" }, { status: "extracted", pageCount: 3, extraction: ANALYSIS }]);
    expectSettledSignal();
  });

  it("picks a retried document back up while it is still extracting", async () => {
    rows.selected = [record({ status: "extracting" })];
    rows.updated = [{ id: DOCUMENT_ID }];
    analyze.mockResolvedValue({ pageCount: 1, analysis: ANALYSIS });

    expect(await documentExtract(DOCUMENT_ID)).toBe("extracted");
    expect(analyze).toHaveBeenCalled();
  });

  it("sends no signal when a duplicate run finds the document already settled", async () => {
    rows.selected = [record()];
    analyze.mockResolvedValue({ pageCount: 3, analysis: ANALYSIS });

    expect(await documentExtract(DOCUMENT_ID)).toBe("extracted");
    expect(notifyRooms).not.toHaveBeenCalled();
  });

  it("marks a document Textract refuses as failed with that reason and signals it", async () => {
    rows.selected = [record()];
    rows.updated = [{ id: DOCUMENT_ID }];
    analyze.mockRejectedValue(new AppError(EXTRACTION_ERRORS.DOCUMENT_UNREADABLE));

    expect(await documentExtract(DOCUMENT_ID)).toBe("failed");
    expect(rows.sets).toEqual([{ status: "extracting" }, { status: "failed", failureMessage: EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.MESSAGE }]);
    expectSettledSignal();
  });

  it("rethrows a busy Textract so the job retries, without settling the document", async () => {
    rows.selected = [record()];
    analyze.mockRejectedValue(new AppError(EXTRACTION_ERRORS.EXTRACTION_BUSY));

    await expect(documentExtract(DOCUMENT_ID)).rejects.toMatchObject({ _status: EXTRACTION_ERRORS.EXTRACTION_BUSY.STATUS });
    expect(rows.sets).toEqual([{ status: "extracting" }]);
    expect(notifyRooms).not.toHaveBeenCalled();
  });
});

describe("documentMarkFailed", () => {
  it("no-ops without a signal when the document already settled", async () => {
    expect(await documentMarkFailed(DOCUMENT_ID, EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.MESSAGE)).toBe(false);
    expect(notifyRooms).not.toHaveBeenCalled();
  });
});
