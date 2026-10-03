import type { UploadRequestState } from "./uploadRequest.js";

export type UploadRequestPortal = {
  clientName: string;
  requestedBy: string;
  note: string | null;
  state: UploadRequestState;
  expiresAt: string;
  maxFiles: number;
};
