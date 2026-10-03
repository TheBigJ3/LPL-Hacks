import { Readable } from "stream";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../modules/AppError.js";
import { DOCUMENT_ERRORS } from "../../../types/native/documents/errors.js";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";

const { db, rows, s3Send, analyzeStart, analyzeCollect, notifyRooms } = vi.hoisted(() => {
  const rows = { selected: [] as unknown[], updated: [] as unknown[], sets: [] as unknown[] };

  const db = {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => rows.selected }) }) })),
    update: vi.fn(() => ({
      set: (values: unknown) => {
        rows.sets.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => rows.updated }) };
      },
    })),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => [{ ...values, status: "uploaded", pageCount: null, failureMessage: null }],
      }),
    })),
  };

  return { db, rows, s3Send: vi.fn(), analyzeStart: vi.fn(), analyzeCollect: vi.fn(), notifyRooms: vi.fn() };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));
vi.mock("../../../loaders/s3Loader.js", () => ({ S3_DOCUMENTS_BUCKET: "documents-bucket", s3_client: { send: s3Send } }));
vi.mock("../../../services/extraction/extractedFieldMethods.js", () => ({
  extractedFieldAnalyzeStart: analyzeStart,
  extractedFieldAnalyzeCollect: analyzeCollect,
}));
vi.mock("../../../services/realtime/realtimeMethods.js", () => ({ realtimeNotifyRooms: notifyRooms }));

const {
  documentCreate,
  documentExtractCollect,
  documentExtractStart,
  documentGet,
  documentMarkFailed,
} = await import("../../../services/documents/documentMethods.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const ANALYSIS = { fields: [], tables: [], lines: [{ text: "Page one", confidence: 99, confidenceLevel: "high", page: 1, box: null }] };

const record = (overrides: Record<string, unknown> = {}) => ({
  id: DOCUMENT_ID,
  fileName: "statement.pdf",
  contentType: "application/pdf",
  s3Key: `documents/${DOCUMENT_ID}`,
  status: "uploaded",
  textractJobId: null,
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
});

describe("documentCreate", () => {
  it("stores the upload in S3 under the new document's id before recording it as uploaded", async () => {
    const body = Readable.from(["%PDF"]);

    const document = await documentCreate({ fileName: "statement.pdf", contentType: "application/pdf", contentLength: 4, body });

    const command = s3Send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "documents-bucket",
      Key: `documents/${document.id}`,
      Body: body,
      ContentType: "application/pdf",
      ContentLength: 4,
    });
    expect(document).toEqual({ id: document.id, fileName: "statement.pdf", status: "uploaded", pageCount: null, failureMessage: null });
  });

  it("records nothing when S3 rejects the upload", async () => {
    s3Send.mockRejectedValue(new Error("AccessDenied"));

    await expect(documentCreate({ fileName: "a.pdf", contentType: "application/pdf", contentLength: 4, body: Readable.from(["%PDF"]) })).rejects.toThrow("AccessDenied");
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

describe("documentExtractStart", () => {
  it.each([["missing", []], ["extracted", [record({ status: "extracted" })]], ["failed", [record({ status: "failed" })]]])(
    "does nothing for a %s document",
    async (_case, selected) => {
      rows.selected = selected;

      expect(await documentExtractStart(DOCUMENT_ID)).toBe(false);
      expect(analyzeStart).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it("keeps polling a document already extracting without starting Textract again", async () => {
    rows.selected = [record({ status: "extracting", textractJobId: "job-1" })];

    expect(await documentExtractStart(DOCUMENT_ID)).toBe(true);
    expect(analyzeStart).not.toHaveBeenCalled();
  });

  it("starts Textract on the stored object and moves the document to extracting with its job id", async () => {
    rows.selected = [record()];
    analyzeStart.mockResolvedValue("job-1");

    expect(await documentExtractStart(DOCUMENT_ID)).toBe(true);
    expect(analyzeStart).toHaveBeenCalledWith(DOCUMENT_ID, { bucket: "documents-bucket", key: `documents/${DOCUMENT_ID}` });
    expect(rows.sets).toEqual([{ status: "extracting", textractJobId: "job-1" }]);
  });

  it("marks a document Textract refuses as failed with that reason and signals it", async () => {
    rows.selected = [record()];
    rows.updated = [{ id: DOCUMENT_ID }];
    analyzeStart.mockRejectedValue(new AppError(EXTRACTION_ERRORS.DOCUMENT_UNREADABLE));

    expect(await documentExtractStart(DOCUMENT_ID)).toBe(false);
    expect(rows.sets).toEqual([{ status: "failed", failureMessage: EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.MESSAGE }]);
    expectSettledSignal();
  });

  it("rethrows a busy Textract so the job retries, leaving the document untouched", async () => {
    rows.selected = [record()];
    analyzeStart.mockRejectedValue(new AppError(EXTRACTION_ERRORS.EXTRACTION_BUSY));

    await expect(documentExtractStart(DOCUMENT_ID)).rejects.toMatchObject({ _status: EXTRACTION_ERRORS.EXTRACTION_BUSY.STATUS });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("documentExtractCollect", () => {
  it.each([["missing", []], ["uploaded", [record()]], ["extracted", [record({ status: "extracted", textractJobId: "job-1" })]]])(
    "treats a %s document as settled without asking Textract",
    async (_case, selected) => {
      rows.selected = selected;

      expect(await documentExtractCollect(DOCUMENT_ID)).toBe("settled");
      expect(analyzeCollect).not.toHaveBeenCalled();
    },
  );

  it("reports pending while Textract is still working, writing nothing", async () => {
    rows.selected = [record({ status: "extracting", textractJobId: "job-1" })];
    analyzeCollect.mockResolvedValue({ status: "pending" });

    expect(await documentExtractCollect(DOCUMENT_ID)).toBe("pending");
    expect(analyzeCollect).toHaveBeenCalledWith("job-1");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("marks the document failed when Textract's job failed", async () => {
    rows.selected = [record({ status: "extracting", textractJobId: "job-1" })];
    rows.updated = [{ id: DOCUMENT_ID }];
    analyzeCollect.mockResolvedValue({ status: "failed", message: EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.MESSAGE });

    expect(await documentExtractCollect(DOCUMENT_ID)).toBe("settled");
    expect(rows.sets).toEqual([{ status: "failed", failureMessage: EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.MESSAGE }]);
    expectSettledSignal();
  });

  it("saves the analysis and page count, then signals the document's room", async () => {
    rows.selected = [record({ status: "extracting", textractJobId: "job-1" })];
    rows.updated = [{ id: DOCUMENT_ID }];
    analyzeCollect.mockResolvedValue({ status: "succeeded", pageCount: 3, analysis: ANALYSIS });

    expect(await documentExtractCollect(DOCUMENT_ID)).toBe("settled");
    expect(rows.sets).toEqual([{ status: "extracted", pageCount: 3, extraction: ANALYSIS }]);
    expectSettledSignal();
  });

  it("sends no signal when a duplicate run finds the document already settled", async () => {
    rows.selected = [record({ status: "extracting", textractJobId: "job-1" })];
    analyzeCollect.mockResolvedValue({ status: "succeeded", pageCount: 3, analysis: ANALYSIS });

    expect(await documentExtractCollect(DOCUMENT_ID)).toBe("settled");
    expect(notifyRooms).not.toHaveBeenCalled();
  });
});

describe("documentMarkFailed", () => {
  it("no-ops without a signal when the document already settled", async () => {
    expect(await documentMarkFailed(DOCUMENT_ID, EXTRACTION_ERRORS.EXTRACTION_TIMED_OUT.MESSAGE)).toBe(false);
    expect(notifyRooms).not.toHaveBeenCalled();
  });
});
