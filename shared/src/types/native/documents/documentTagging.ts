export type DocumentTagStatus = "pending" | "tagged" | "failed";

export type DocumentIndexStatus = "pending" | "indexed" | "failed";

export type DocumentTagEvidence = {
  id: string;
  text: string;
};

export type DocumentTagSource = "docType" | "model";

export type DocumentTagMemberBasis = "fullName" | "partialName" | "onlyCandidate";

export type DocumentTagging = {
  docType: { choice: string; evidence: DocumentTagEvidence[] } | null;
  tags: { name: string; source: DocumentTagSource; evidence: DocumentTagEvidence[] }[];
  members: { memberId: string; name: string; basis: DocumentTagMemberBasis; evidence: DocumentTagEvidence[] }[];
  taggedAt: string;
};
