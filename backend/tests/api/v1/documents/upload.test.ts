import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENERAL_ERRORS } from "../../../../types/native/errors.js";

const { documentCreate, extractProducer } = vi.hoisted(() => ({ documentCreate: vi.fn(), extractProducer: vi.fn() }));

vi.mock("../../../../services/documents/documentMethods.js", () => ({
  documentCreate,
  DOCUMENT_UPLOAD_RULES: { mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/tiff"], maxBytes: 50 * 1024 * 1024 },
}));
vi.mock("../../../../mq/jobs/documents/documentExtract.js", () => ({ default: { producer: extractProducer } }));

const { default: upload } = await import("../../../../api/v1/documents/upload.js");

const DOCUMENT = { id: "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11", fileName: "statement.pdf", status: "uploaded", pageCount: null, failureMessage: null };

const request = (query: Record<string, string>, headers: Record<string, string>) => ({ query, headers }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upload", () => {
  it("records the document and only then enqueues its extraction", async () => {
    documentCreate.mockResolvedValue(DOCUMENT);
    const req = request({ fileName: "statement.pdf" }, { "content-type": "application/pdf", "content-length": "2048" });

    await expect(upload.handler(req, {} as any)).resolves.toEqual({ success: true, document: DOCUMENT });
    expect(documentCreate).toHaveBeenCalledWith({ fileName: "statement.pdf", body: req, contentType: "application/pdf", contentLength: 2048 });
    expect(extractProducer).toHaveBeenCalledWith({ documentId: DOCUMENT.id });
    expect(documentCreate.mock.invocationCallOrder[0]).toBeLessThan(extractProducer.mock.invocationCallOrder[0]!);
  });

  it("rejects an upload without a file name before storing anything", async () => {
    await expect(upload.handler(request({}, { "content-type": "application/pdf", "content-length": "2048" }), {} as any))
      .rejects.toMatchObject({ _status: GENERAL_ERRORS.BAD_REQUEST.STATUS });
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it("accepts a multi-page PDF up to 50 MB and rejects anything larger", async () => {
    documentCreate.mockResolvedValue(DOCUMENT);

    await expect(upload.handler(request({ fileName: "a.pdf" }, { "content-type": "application/pdf", "content-length": String(50 * 1024 * 1024) }), {} as any)).resolves.toBeTruthy();
    await expect(upload.handler(request({ fileName: "a.pdf" }, { "content-type": "application/pdf", "content-length": String(50 * 1024 * 1024 + 1) }), {} as any))
      .rejects.toMatchObject({ _status: GENERAL_ERRORS.UPLOAD_TOO_LARGE.STATUS });
  });
});
