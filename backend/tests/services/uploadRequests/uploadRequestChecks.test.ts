import { describe, expect, it } from "vitest";
import {
  UPLOAD_REQUEST_MAX_FILES,
  uploadRequestCheckCanAddFile,
  uploadRequestCheckCanSubmit,
  uploadRequestCheckState,
} from "../../../services/uploadRequests/uploadRequestChecks.js";
import { UPLOAD_REQUEST_ERRORS } from "../../../types/native/uploadRequests/errors.js";

const NOW = new Date("2026-10-03T12:00:00Z");
const LATER = new Date("2026-10-10T12:00:00Z");

describe("uploadRequestCheckState", () => {
  it("keeps an open request open until its expiry", () => {
    expect(uploadRequestCheckState({ status: "open", expiresAt: LATER }, NOW)).toBe("open");
  });

  it("treats an open request as expired from the exact expiry instant", () => {
    expect(uploadRequestCheckState({ status: "open", expiresAt: NOW }, NOW)).toBe("expired");
  });

  it("reports a submitted or revoked request as such even after it would have expired", () => {
    expect(uploadRequestCheckState({ status: "submitted", expiresAt: NOW }, LATER)).toBe("submitted");
    expect(uploadRequestCheckState({ status: "revoked", expiresAt: NOW }, LATER)).toBe("revoked");
  });
});

describe("uploadRequestCheckCanAddFile", () => {
  it("accepts files up to the cap and rejects the one past it", () => {
    expect(() => uploadRequestCheckCanAddFile({ status: "open", expiresAt: LATER, documentCount: UPLOAD_REQUEST_MAX_FILES - 1 }, NOW)).not.toThrow();
    expect(() => uploadRequestCheckCanAddFile({ status: "open", expiresAt: LATER, documentCount: UPLOAD_REQUEST_MAX_FILES }, NOW))
      .toThrow(expect.objectContaining({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_FULL.STATUS }));
  });

  it("names why a closed link can't take files", () => {
    expect(() => uploadRequestCheckCanAddFile({ status: "open", expiresAt: NOW, documentCount: 0 }, NOW))
      .toThrow(expect.objectContaining({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_EXPIRED.STATUS }));
    expect(() => uploadRequestCheckCanAddFile({ status: "revoked", expiresAt: LATER, documentCount: 0 }, NOW))
      .toThrow(expect.objectContaining({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_REVOKED.STATUS }));
    expect(() => uploadRequestCheckCanAddFile({ status: "submitted", expiresAt: LATER, documentCount: 1 }, NOW))
      .toThrow(expect.objectContaining({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_SUBMITTED.STATUS }));
  });
});

describe("uploadRequestCheckCanSubmit", () => {
  it("refuses to close a link that received no files", () => {
    expect(() => uploadRequestCheckCanSubmit({ status: "open", expiresAt: LATER, documentCount: 0 }, NOW))
      .toThrow(expect.objectContaining({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_EMPTY.STATUS }));
  });

  it("checks the link is still open before counting files", () => {
    expect(() => uploadRequestCheckCanSubmit({ status: "submitted", expiresAt: LATER, documentCount: 0 }, NOW))
      .toThrow(expect.objectContaining({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_SUBMITTED.STATUS }));
  });

  it("allows submitting an open link with files", () => {
    expect(() => uploadRequestCheckCanSubmit({ status: "open", expiresAt: LATER, documentCount: 1 }, NOW)).not.toThrow();
  });
});
