import type { DocumentIndexStatus, DocumentTagStatus } from "./documentTagging.js";

export type DocumentStatus = "uploaded" | "extracting" | "extracted" | "failed";

export type Document = {
  id: string;
  fileName: string;
  status: DocumentStatus;
  pageCount: number | null;
  failureMessage: string | null;
  tagStatus: DocumentTagStatus | null;
  tagFailureMessage: string | null;
  indexStatus: DocumentIndexStatus | null;
};
