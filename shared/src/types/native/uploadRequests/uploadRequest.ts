import type { Document } from "../documents/document.js";

export const uploadRequestExpiryDays = [1, 3, 7, 14] as const;

export type UploadRequestExpiryDays = typeof uploadRequestExpiryDays[number];

export type UploadRequestStatus = "open" | "submitted" | "revoked";

export type UploadRequestState = UploadRequestStatus | "expired";

export type UploadRequest = {
  id: string;
  clientId: string;
  token: string;
  note: string | null;
  state: UploadRequestState;
  expiresAt: string;
  submittedAt: string | null;
  createdAt: string;
  documents: Document[];
};
