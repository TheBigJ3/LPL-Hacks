import { Readable } from "stream";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../modules/AppError.js";
import { CLIENT_ERRORS } from "../../../types/native/clients/errors.js";
import { DOCUMENT_ERRORS } from "../../../types/native/documents/errors.js";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";

const { db, rows, s3Send, analyze, notifyRooms } = vi.hoisted(() => {
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
        return { returning: async () => [{ ...values, status: "uploaded", pageCount: null, failureMessage: null }] };
      },
    })),
  };

  return { db, rows, s3Send: vi.fn(), analyze: vi.fn(), notifyRooms: vi.fn() };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));
vi.mock("../../../loaders/s3Loader.js", () => ({ S3_DOCUMENTS_BUCKET: "documents-bucket", s3_client: { send: s3Send } }));
vi.mock("../../../services/extraction/extractedFieldMethods.js", () => ({
  extractedFieldAnalyze: analyze,
}));
vi.mock("../../../services/realtime/realtimeMethods.js", () => ({ realtimeNotifyRooms: notifyRooms }));

const {
  documentCreate,
  documentExtract,
  documentGet,
  documentGetContent,
  documentMarkFailed,
} = await import("../../../services/documents/documentMethods.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const CONTENT = new Uint8Array(Buffer.from("%PDF"));
const ANALYSIS = { fields: [], tables: [], lines: [{ text: "Page one", confidence: 99, confidenceLevel: "high", page: 1, box: null }] };

const record = (overrides: Record<string, unknown> = {}) => ({
  id: DOCUMENT_ID,
  fileName: "statement.pdf",
  contentType: "application/pdf",
  s3Key: `documents/${DOCUMENT_ID}`,
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
  s3Send.mockResolvedValue({ Body: { transformToByteArray: async () => CONTENT } });
});

describe("documentCreate", () => {
  it("streams the upload to S3 under the new document's id before recording it as uploaded", async () => {
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
    expect(rows.inserted).toEqual([{ id: document.id, fileName: "statement.pdf", contentType: "application/pdf", s3Key: `documents/${document.id}` }]);
    expect(document).toEqual({ id: document.id, fileName: "statement.pdf", status: "uploaded", pageCount: null, failureMessage: null });
  });

  it("records nothing when S3 rejects the upload", async () => {
    s3Send.mockRejectedValue(new Error("AccessDenied"));

    await expect(documentCreate({ fileName: "a.pdf", contentType: "application/pdf", contentLength: 4, body: Readable.from(["%PDF"]) })).rejects.toThrow("AccessDenied");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("documentCreate client link", () => {
  it("reports an unknown client instead of a database error", async () => {
    db.insert.mockImplementationOnce(() => ({
      values: () => ({ returning: async () => { throw Object.assign(new Error("Failed query"), { cause: { code: "23503" } }); } }),
    }));

    await expect(documentCreate({ fileName: "a.pdf", clientId: "missing", contentType: "application/pdf", contentLength: 4, body: Readable.from(["%PDF"]) }))
      .rejects.toMatchObject({ _status: CLIENT_ERRORS.CLIENT_NOT_FOUND.STATUS });
  });
});

describe("documentGetContent", () => {
  it("throws the not-found AppError for an unknown id without touching S3", async () => {
    await expect(documentGetContent(DOCUMENT_ID)).rejects.toMatchObject({ _status: DOCUMENT_ERRORS.DOCUMENT_NOT_FOUND.STATUS });
    expect(s3Send).not.toHaveBeenCalled();
  });

  it("streams the stored object with the document's type", async () => {
    const body = Readable.from(["%PDF"]);
    rows.selected = [{ contentType: "application/pdf", s3Key: `documents/${DOCUMENT_ID}` }];
    s3Send.mockResolvedValue({ Body: body });

    await expect(documentGetContent(DOCUMENT_ID)).resolves.toEqual({ contentType: "application/pdf", body });
    expect(s3Send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
    expect(s3Send.mock.calls[0]![0].input).toEqual({ Bucket: "documents-bucket", Key: `documents/${DOCUMENT_ID}` });
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
      expect(s3Send).not.toHaveBeenCalled();
      expect(analyze).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it("analyzes the file downloaded from S3, then saves the analysis and page count and signals the document's room", async () => {
    rows.selected = [record()];
    rows.updated = [{ id: DOCUMENT_ID }];
    analyze.mockResolvedValue({ pageCount: 3, analysis: ANALYSIS });

    expect(await documentExtract(DOCUMENT_ID)).toBe("extracted");
    const command = s3Send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "documents-bucket", Key: `documents/${DOCUMENT_ID}` });
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

  it("rethrows a failed download so the job retries, without analyzing or settling the document", async () => {
    rows.selected = [record()];
    s3Send.mockRejectedValue(new Error("SlowDown"));

    await expect(documentExtract(DOCUMENT_ID)).rejects.toThrow("SlowDown");
    expect(analyze).not.toHaveBeenCalled();
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
