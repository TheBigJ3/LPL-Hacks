export type RetrievalSourceType = "document" | "note";

export type RetrievalCitation = {
  documentId: string;
  sectionId: string;
  page: number | null;
};

export type RetrievalChunk = {
  text: string;
  score: number | null;
  citation: RetrievalCitation;
  sourceType: RetrievalSourceType;
  clientId: string;
  fileName: string | null;
  docType: string | null;
  tags: string[];
  familyMembers: string[];
  taxYear: number | null;
  date: string | null;
};
