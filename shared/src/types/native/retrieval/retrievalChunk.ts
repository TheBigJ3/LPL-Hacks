export type RetrievalCitation = {
  documentId: string;
  page: number;
};

export type RetrievalChunk = {
  text: string;
  score: number | null;
  citation: RetrievalCitation;
  clientId: string;
  tags: string[];
  taxYear: number | null;
  familyMember: string | null;
};
