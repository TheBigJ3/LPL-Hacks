import { z } from "zod";
import { DocumentReviewFieldZod } from "../../zod/documents/documentReview.js";

export type DocumentReviewField = z.infer<typeof DocumentReviewFieldZod>;

export type DocumentReviewValue = DocumentReviewField["value"];

export type DocumentReview = {
  reviewedAt: string;
  fields: Record<string, DocumentReviewField>;
};
