import type { RetrievalSourceType } from "../retrieval/retrievalChunk.js";

export type InsightMessageRole = "user" | "assistant";

export type InsightMessageStatus = "pending" | "streaming" | "complete" | "failed";

export type InsightCitation = {
  sourceId: string;
  sourceType: RetrievalSourceType;
  documentId: string;
  page: number | null;
  fileName: string | null;
  quote: string;
  verified: boolean;
};

export type InsightSourceField = {
  value: string;
  verified: boolean;
};

export type InsightSource = InsightCitation & {
  fields: InsightSourceField[];
};

export type InsightMessage = {
  id: string;
  conversationId: string;
  role: InsightMessageRole;
  status: InsightMessageStatus;
  text: string;
  citations: InsightCitation[];
  failureMessage: string | null;
  createdAt: string;
};

export type InsightConversation = {
  id: string;
  clientId: string;
  messages: InsightMessage[];
};

export type InsightConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};
