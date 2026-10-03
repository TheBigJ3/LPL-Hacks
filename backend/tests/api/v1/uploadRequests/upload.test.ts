import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../modules/AppError.js";
import { GENERAL_ERRORS } from "../../../../types/native/errors.js";
import { UPLOAD_REQUEST_ERRORS } from "../../../../types/native/uploadRequests/errors.js";

const { documentCreate, getUploadTarget, extractProducer } = vi.hoisted(() => ({
  documentCreate: vi.fn(),
  getUploadTarget: vi.fn(),
  extractProducer: vi.fn(),
}));

vi.mock("../../../../services/documents/documentMethods.js", () => ({
  documentCreate,
  DOCUMENT_UPLOAD_RULES: { mimeTypes: ["application/pdf"], maxBytes: 1024 },
}));
vi.mock("../../../../services/uploadRequests/uploadRequestMethods.js", () => ({ uploadRequestGetUploadTarget: getUploadTarget }));
vi.mock("../../../../mq/jobs/documents/documentExtract.js", () => ({ default: { producer: extractProducer } }));

const { default: upload } = await import("../../../../api/v1/uploadRequests/upload.js");

const TOKEN = "b".repeat(32);
const TARGET = { uploadRequestId: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", clientId: "6b0f1d3c-1f2a-4c5e-9d8b-7a6c5b4e3d21" };
const HEADERS = { "content-type": "application/pdf", "content-length": "512" };

const request = (query: Record<string, string>, headers: Record<string, string> = HEADERS) => ({ query, headers }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upload", () => {
  it("files the document under the link's request and client, then enqueues extraction", async () => {
    getUploadTarget.mockResolvedValue(TARGET);
    documentCreate.mockResolvedValue({ id: "doc-1", fileName: "w2.pdf" });
    const req = request({ token: TOKEN, fileName: "w2.pdf" });

    await expect(upload.handler(req, {} as any)).resolves.toEqual({ success: true, fileName: "w2.pdf" });
    expect(getUploadTarget).toHaveBeenCalledWith(TOKEN);
    expect(documentCreate).toHaveBeenCalledWith({ fileName: "w2.pdf", ...TARGET, body: req, contentType: "application/pdf", contentLength: 512 });
    expect(extractProducer).toHaveBeenCalledWith({ documentId: "doc-1" });
  });

  it("stores nothing when the link can't take the file", async () => {
    getUploadTarget.mockRejectedValue(new AppError(UPLOAD_REQUEST_ERRORS.REQUEST_SUBMITTED));

    await expect(upload.handler(request({ token: TOKEN, fileName: "w2.pdf" }), {} as any))
      .rejects.toMatchObject({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_SUBMITTED.STATUS });
    expect(documentCreate).not.toHaveBeenCalled();
    expect(extractProducer).not.toHaveBeenCalled();
  });

  it("rejects a malformed token before looking it up", async () => {
    await expect(upload.handler(request({ token: "short", fileName: "w2.pdf" }), {} as any))
      .rejects.toMatchObject({ _status: GENERAL_ERRORS.BAD_REQUEST.STATUS });
    expect(getUploadTarget).not.toHaveBeenCalled();
  });
});
