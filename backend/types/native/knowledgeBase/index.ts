export type KnowledgeBaseField = {
  fieldId: string;
  key: string;
  value: string;
  confidence: number;
};

export type KnowledgeBasePage = {
  page: number;
  text: string;
  fields: KnowledgeBaseField[];
};

export type KnowledgeBaseDocument = {
  documentId: string;
  clientId: string;
  fileName: string;
  formType?: string;
  tags: string[];
  taxYear?: number;
  familyMember?: string;
  pages: KnowledgeBasePage[];
};
