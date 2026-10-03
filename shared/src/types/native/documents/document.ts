export type DocumentStatus = "uploaded" | "extracting" | "extracted" | "failed";

export type Document = {
  id: string;
  fileName: string;
  status: DocumentStatus;
  pageCount: number | null;
  failureMessage: string | null;
};
