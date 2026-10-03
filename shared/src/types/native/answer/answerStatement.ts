export type AnswerCitation = {
  documentId: string;
  sectionId: string;
  page: number | null;
  fileName: string | null;
  quote: string;
  verified: boolean;
};

export type AnswerStatement = {
  text: string;
  citations: AnswerCitation[];
};
