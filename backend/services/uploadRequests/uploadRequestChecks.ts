import type { UploadRequestState, UploadRequestStatus } from "@lpl-hacks/shared/src/types/native/uploadRequests/uploadRequest.js";
import { AppError } from "../../modules/AppError.js";
import type { ERROR_TYPE } from "../../types/native/errors.js";
import { UPLOAD_REQUEST_ERRORS } from "../../types/native/uploadRequests/errors.js";

export const UPLOAD_REQUEST_MAX_FILES = 20;

type UploadRequestLifecycle = {
  status: UploadRequestStatus;
  expiresAt: Date;
};

const UPLOAD_REQUEST_CLOSED_ERRORS: Record<Exclude<UploadRequestState, "open">, ERROR_TYPE> = {
  expired: UPLOAD_REQUEST_ERRORS.REQUEST_EXPIRED,
  revoked: UPLOAD_REQUEST_ERRORS.REQUEST_REVOKED,
  submitted: UPLOAD_REQUEST_ERRORS.REQUEST_SUBMITTED,
};

export function uploadRequestCheckState(request: UploadRequestLifecycle, now: Date): UploadRequestState {
  if (request.status !== "open") return request.status;
  return request.expiresAt.getTime() <= now.getTime() ? "expired" : "open";
}

export function uploadRequestCheckOpen(request: UploadRequestLifecycle, now: Date): void {
  const state = uploadRequestCheckState(request, now);
  if (state !== "open") throw new AppError(UPLOAD_REQUEST_CLOSED_ERRORS[state]);
}

export function uploadRequestCheckCanAddFile(request: UploadRequestLifecycle & { documentCount: number }, now: Date): void {
  uploadRequestCheckOpen(request, now);
  if (request.documentCount >= UPLOAD_REQUEST_MAX_FILES) throw new AppError(UPLOAD_REQUEST_ERRORS.REQUEST_FULL);
}

export function uploadRequestCheckCanSubmit(request: UploadRequestLifecycle & { documentCount: number }, now: Date): void {
  uploadRequestCheckOpen(request, now);
  if (request.documentCount === 0) throw new AppError(UPLOAD_REQUEST_ERRORS.REQUEST_EMPTY);
}
