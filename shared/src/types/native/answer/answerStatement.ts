import type { RetrievalSourceType } from "../retrieval/retrievalChunk.js";

export type AnswerCitation = {
  documentId: string;
  sectionId: string;
  sourceType: RetrievalSourceType;
  page: number | null;
  fileName: string | null;
  quote: string;
  verified: boolean;
};

export type AnswerStatement = {
  text: string;
  citations: AnswerCitation[];
};
