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
