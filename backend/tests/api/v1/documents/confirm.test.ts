import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../modules/AppError.js";
import { DOCUMENT_ERRORS } from "../../../../types/native/documents/errors.js";
import { GENERAL_ERRORS } from "../../../../types/native/errors.js";

const { documentConfirm, tagProducer } = vi.hoisted(() => ({ documentConfirm: vi.fn(), tagProducer: vi.fn() }));

vi.mock("../../../../services/documents/documentMethods.js", () => ({ documentConfirm }));
vi.mock("../../../../mq/jobs/documents/documentTag.js", () => ({ default: { producer: tagProducer } }));

const { default: confirm } = await import("../../../../api/v1/documents/confirm.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const REVIEWED_AT = "2026-10-03T12:00:00.000Z";
const FIELDS = { wages: { value: "84,250.00", corrected: true } };

const request = (body: unknown) => ({ body, user: { userId: "advisor" } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("confirm", () => {
  it("saves the review and only then queues tagging for that confirmation", async () => {
    documentConfirm.mockResolvedValue({ document: { id: DOCUMENT_ID }, reviewedAt: REVIEWED_AT });

    await expect(confirm.handler(request({ documentId: DOCUMENT_ID, fields: FIELDS }), {} as any)).resolves.toEqual({ success: true, document: { id: DOCUMENT_ID } });
    expect(documentConfirm).toHaveBeenCalledWith(DOCUMENT_ID, FIELDS);
    expect(tagProducer).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, reviewedAt: REVIEWED_AT });
    expect(documentConfirm.mock.invocationCallOrder[0]).toBeLessThan(tagProducer.mock.invocationCallOrder[0]!);
  });

  it("queues nothing when the review is rejected", async () => {
    documentConfirm.mockRejectedValue(new AppError(DOCUMENT_ERRORS.REVIEW_INCOMPLETE));

    await expect(confirm.handler(request({ documentId: DOCUMENT_ID, fields: {} }), {} as any)).rejects.toMatchObject({ _status: DOCUMENT_ERRORS.REVIEW_INCOMPLETE.STATUS });
    expect(tagProducer).not.toHaveBeenCalled();
  });

  it("rejects a field value that is neither text nor a checkbox", async () => {
    await expect(confirm.handler(request({ documentId: DOCUMENT_ID, fields: { wages: { value: 5, corrected: false } } }), {} as any))
      .rejects.toMatchObject({ _status: GENERAL_ERRORS.BAD_REQUEST.STATUS });
    expect(documentConfirm).not.toHaveBeenCalled();
  });
});
