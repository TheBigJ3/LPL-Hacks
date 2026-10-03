import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/documents/get.js";
import type { Document } from "../../../documents/document.js";
import type { DocumentReview } from "../../../documents/documentReview.js";
import type { DocumentTagging } from "../../../documents/documentTagging.js";
import type { ExtractedAnalysis } from "../../../extraction/extractedAnalysis.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  document: Document;
  extraction: ExtractedAnalysis | null;
  review: DocumentReview | null;
  tagging: DocumentTagging | null;
};
