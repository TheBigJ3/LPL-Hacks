import type { DocumentIndexStatus, DocumentTagging, DocumentTagStatus } from "./documentTagging.js";

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

export type DocumentListItem = Document & {
  createdAt: string;
  tagging: DocumentTagging | null;
};
