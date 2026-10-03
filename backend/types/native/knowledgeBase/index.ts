export type KnowledgeBaseSection = {
  sectionId: string;
  page: number | null;
  text: string;
};

export type KnowledgeBaseDocument = {
  documentId: string;
  clientId: string;
  fileName: string;
  docType: string | null;
  tags: string[];
  familyMembers: string[];
  taxYear: number | null;
  sections: KnowledgeBaseSection[];
};

export type KnowledgeBasePageField = {
  fieldId: string;
  label: string;
  value: string;
  confidence: number | null;
  verified: boolean;
  corrected: boolean;
};

export type KnowledgeBaseDocumentPage = {
  page: number;
  fields: KnowledgeBasePageField[];
  lines: string[];
};

export type KnowledgeBaseIndexedDocument = {
  documentId: string;
  clientId: string;
  fileName: string;
  docType: string | null;
  taxYear: number | null;
  tags: string[];
  familyMembers: string[];
  memberNames: string[];
  pageCount: number;
  pages: KnowledgeBaseDocumentPage[];
};
