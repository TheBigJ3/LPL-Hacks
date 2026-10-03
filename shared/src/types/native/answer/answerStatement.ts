export type AnswerCitation = {
  documentId: string;
  page: number;
  fileName: string | null;
  fieldId: string | null;
  verified: boolean;
};

export type AnswerStatement = {
  text: string;
  citations: AnswerCitation[];
};
